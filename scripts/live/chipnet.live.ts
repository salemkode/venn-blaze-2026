// Live Chipnet run of Venn v2 and Circle with dedicated test keys, using the app's own
// builders. Every transaction is verified by the BCH 2026 VM before it is broadcast, and each
// broadcast is recorded before the next step. State and test keys live in the gitignored
// artifacts/live-v2/. Steps run one at a time:
//   STEP=keys|status|mint|venn|spend|vote|recovery|complete|circle|payto|xomint|rawsend npx vitest run --config scripts/live/vitest.live.config.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { binToHex, equal, hexToBin } from '../../src/core/bytes';
import { addressForLockingBytecode } from '../../src/core/cashaddr';
import { hash160, publicKeyOf } from '../../src/core/crypto';
import { type Draft, type Utxo, DUST, p2pkhForPublicKey, settleFee, signPersonal, sourceOf, spendable, sum } from '../../src/core/draft';
import { type Output, SEQUENCE_FINAL, type Transaction, decodeTransaction, encodeTransaction, txidOf } from '../../src/core/tx';
import {
  buildBudgetSpend,
  buildRecoveryComplete,
  buildRecoveryRequest,
  buildVennFeePreparation,
  buildVennGenesis,
  buildVote,
  finalizeRecovery,
  finalizeSpend,
  finalizeVote,
  signFeeInputs,
  signVenn,
} from '../../src/venn/build';
import { broadcast, chain, chainNow, readCircle, readVenn } from '../../src/venn/chain';
import { type CircleParams, circleMoneyLocking } from '../../src/venn/circle';
import { buildCircleGenesis, buildContribute, buildPayout, buildSweep, finalizeCircle } from '../../src/venn/circleBuild';
import type { VennParams } from '../../src/venn/contract';
import { BUDGET, ROLE, STOP } from '../../src/venn/layout';
import { approvalFor, decodeProposal, describeProposal, draftOf, encodeProposal, proposalFor } from '../../src/venn/proposal';
import { vmVerify } from '../../tests/helpers';

const dir = new URL('../../artifacts/live-v2/', import.meta.url);
const statePath = new URL('state.json', dir);
type Key = { privateKey: Uint8Array; publicKey: Uint8Array; hex: string };
interface State {
  keys: Record<string, string>;
  token?: string;
  venn?: { vaultCategory: string; assetCategory: string };
  circle?: Record<string, string | string[]>;
  log: { step: string; txid: string; note: string }[];
}
const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x), 2);
const load = (): State => (existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { keys: {}, log: [] });
const save = (s: State) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(statePath, json(s) + '\n', { mode: 0o600 });
};
const keyOf = (s: State, name: string): Key => {
  const privateKey = hexToBin(s.keys[name]);
  const publicKey = publicKeyOf(privateKey);
  return { privateKey, publicKey, hex: binToHex(publicKey) };
};
const lock = (k: Key) => p2pkhForPublicKey(k.publicKey);
const addr = (k: Key, tokens = false) => addressForLockingBytecode(lock(k), 'chipnet', tokens);
const pkh = (k: Key) => binToHex(hash160(k.publicKey));
const coins = (k: Key) => chain('chipnet').utxos(lock(k));
const say = (line: string) => process.stdout.write(line + '\n');
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
/** Waits until the server lists a coin matching `match` for this key. */
async function coinWhere(k: Key, match: (u: Utxo) => boolean) {
  for (let i = 0; i < 30; i++) {
    const found = (await coins(k)).find(match);
    if (found) return found;
    await pause(2_000);
  }
  throw new Error('The expected coin did not appear');
}
/** Waits until the server has indexed `txid` (as an output at one of the key's or contract's coins). */
async function settled(txid: string) {
  for (let i = 0; i < 30; i++) {
    try {
      await chain('chipnet').transactionHex(txid);
      return;
    } catch {
      await pause(2_000);
    }
  }
}

/** Verifies with the VM, then broadcasts once and records the txid. */
async function send(s: State, step: string, tx: Transaction, sources: Output[], note: string) {
  const ok = vmVerify(tx, sources);
  if (ok !== true) throw new Error(`${step}: VM rejected the transaction: ${ok}`);
  const txid = txidOf(tx);
  s.log.push({ step, txid, note });
  save(s);
  await broadcast(tx, 'chipnet');
  await settled(txid);
  await pause(1_500);
  say(`${step}: ${note} → ${txid} (${encodeTransaction(tx).length} bytes)`);
  return txid;
}

/** A self-transfer of the key's largest plain coin, so its next transaction has a coin at output 0. */
async function prepVout0(s: State, k: Key) {
  const own = spendable(await coins(k));
  if (own.some(u => u.vout === 0 && u.value > 20_000n)) return;
  const draft = buildVennFeePreparation(own.filter(u => u.vout !== 0).concat(own.filter(u => u.vout === 0)), k.publicKey);
  await send(s, 'prep', signPersonal(draft, k.privateKey, k.publicKey), draft.sources, `fee coin at output 0 for ${addr(k)}`);
}

/** Plain transfer of `value` satoshis (and optionally tokens) from `from` to a locking bytecode. */
async function transfer(s: State, step: string, from: Key, to: Uint8Array, value: bigint, token?: { category: string; amount: bigint }) {
  const all = await coins(from);
  const plain = spendable(all);
  const tokenCoins = token ? all.filter(u => u.token?.category === token.category && !u.token.nft) : [];
  const tokenIn = sum(tokenCoins.map(u => u.token!.amount));
  if (token && tokenIn < token.amount) throw new Error('Not enough tokens');
  const chosen: Utxo[] = [...tokenCoins, ...plain];
  const outputs: Output[] = [
    { value, lockingBytecode: to, ...(token ? { token: { category: token.category, amount: token.amount } } : {}) },
    ...(token && tokenIn > token.amount
      ? [{ value: 1_000n, lockingBytecode: lock(from), token: { category: token.category, amount: tokenIn - token.amount } }]
      : []),
  ];
  const draft: Draft = {
    tx: {
      version: 2,
      locktime: 0,
      inputs: chosen.map(u => ({ txid: u.txid, vout: u.vout, sequence: SEQUENCE_FINAL, unlockingBytecode: new Uint8Array() })),
      outputs: [...outputs, { value: 0n, lockingBytecode: lock(from) }],
    },
    sources: chosen.map(sourceOf),
    fee: 0n,
  };
  const total = sum(chosen.map(u => u.value)) - sum(outputs.map(o => o.value));
  settleFee(draft, fee => (draft.tx.outputs[draft.tx.outputs.length - 1].value = total - fee));
  if (draft.tx.outputs[draft.tx.outputs.length - 1].value < DUST) throw new Error('Not enough BCH');
  return send(s, step, signPersonal(draft, from.privateKey, from.publicKey), draft.sources, `transfer ${value} sats${token ? ` + ${token.amount} tokens` : ''}`);
}

const vennParams = (s: State): VennParams => ({ network: 'chipnet', ...s.venn! });
const circleParams = (s: State): CircleParams => {
  const c = s.circle!;
  return {
    network: 'chipnet', circleCategory: c.circleCategory as string, assetCategory: c.assetCategory as string,
    contribution: BigInt(c.contribution as string), period: BigInt(c.period as string), start: BigInt(c.start as string),
    members: c.members as string[],
  };
};
const feeOf = async (k: Key) => ({ utxos: await coins(k), publicKey: k.publicKey });

const steps: Record<string, (s: State) => Promise<void>> = {
  /** TO=<locking bytecode hex> SATS=<n>: fees for a device test wallet, from A. */
  async payto(s) {
    const to = hexToBin(process.env.TO ?? '');
    if (to.length !== 25) throw new Error('TO must be a P2PKH locking bytecode');
    await transfer(s, 'payto', keyOf(s, 'A'), to, BigInt(process.env.SATS ?? '0'));
  },

  async keys(s) {
    for (const name of ['A', 'B', 'C', 'D'])
      if (!s.keys[name]) s.keys[name] = binToHex(crypto.getRandomValues(new Uint8Array(32)));
    save(s);
    for (const name of ['A', 'B', 'C', 'D']) say(`${name} ${addr(keyOf(s, name))} · tokens ${addr(keyOf(s, name), true)}`);
  },

  async status(s) {
    for (const name of Object.keys(s.keys)) {
      const u = await coins(keyOf(s, name));
      say(`${name}: ${sum(spendable(u).map(x => x.value))} sats in ${spendable(u).length} coins; tokens ${sum(u.filter(x => x.token && !x.token.nft).map(x => x.token!.amount))}; unconfirmed ${u.filter(x => !x.height).length}`);
    }
    if (s.venn) {
      const { official, coins: vc } = await readVenn(vennParams(s));
      say(`venn: ${official.status} ${official.status === 'official' ? official.fingerprint : official.reason}; cards ${vc?.cards.map(c => `${c.state.pkh.slice(0, 6)}:r${c.state.recovery}`).join(' ')}; money ${sum((vc?.money ?? []).map(m => m.token?.amount ?? 0n))}`);
    }
    if (s.circle) {
      const { official, coins: cc } = await readCircle(circleParams(s));
      say(`circle: ${official.status}; state ${json(cc?.state.state)}; pot ${sum((cc?.money ?? []).map(m => m.token?.amount ?? 0n))}`);
    }
    say(`tip ${await chain('chipnet').tipHeight()}`);
  },

  async mint(s) {
    const A = keyOf(s, 'A');
    await prepVout0(s, A);
    const coin = await coinWhere(A, u => !u.token && u.vout === 0 && u.value > 20_000n);
    const draft: Draft = {
      tx: {
        version: 2,
        locktime: 0,
        inputs: [{ txid: coin.txid, vout: 0, sequence: SEQUENCE_FINAL, unlockingBytecode: new Uint8Array() }],
        outputs: [
          { value: 1_000n, lockingBytecode: lock(A), token: { category: coin.txid, amount: 10_000_000n } },
          { value: 0n, lockingBytecode: lock(A) },
        ],
      },
      sources: [sourceOf(coin)],
      fee: 0n,
    };
    settleFee(draft, fee => (draft.tx.outputs[1].value = coin.value - 1_000n - fee));
    await send(s, 'mint', signPersonal(draft, A.privateKey, A.publicKey), draft.sources, 'fixed-supply test token (no NFT)');
    s.token = coin.txid;
    save(s);
  },

  /** TO=<locking hex> SATS=<n> AMOUNT=<n>: mint a fixed-supply token (no NFT) straight to TO, e.g. an XO allowance envelope. */
  async xomint(s) {
    const A = keyOf(s, 'A');
    const to = hexToBin(process.env.TO ?? '');
    const value = BigInt(process.env.SATS ?? '0');
    const amount = BigInt(process.env.AMOUNT ?? '0');
    if (to.length < 25 || value < 1_000n || amount <= 0n) throw new Error('Set TO, SATS and AMOUNT');
    await prepVout0(s, A);
    const coin = await coinWhere(A, u => !u.token && u.vout === 0 && u.value > value + 2_000n);
    const draft: Draft = {
      tx: {
        version: 2,
        locktime: 0,
        inputs: [{ txid: coin.txid, vout: 0, sequence: SEQUENCE_FINAL, unlockingBytecode: new Uint8Array() }],
        outputs: [{ value, lockingBytecode: to, token: { category: coin.txid, amount } }, { value: 0n, lockingBytecode: lock(A) }],
      },
      sources: [sourceOf(coin)],
      fee: 0n,
    };
    settleFee(draft, fee => (draft.tx.outputs[1].value = coin.value - value - fee));
    await send(s, 'xomint', signPersonal(draft, A.privateKey, A.publicKey), draft.sources, `fixed-supply token ${coin.txid} for an XO allowance`);
  },

  /** SEQ=<n> [LOCK=<height>] [KEY=A]: a key pays itself with that input sequence and locktime, to see how the node applies BIP68 and locktimes. */
  async seqprobe(s) {
    const A = keyOf(s, process.env.KEY ?? 'A');
    const coin = (await coins(A)).filter(u => !u.token && u.height).sort((a, b) => Number(b.value - a.value))[0];
    const draft: Draft = {
      tx: {
        version: 2,
        locktime: Number(process.env.LOCK ?? 0),
        inputs: [{ txid: coin.txid, vout: coin.vout, sequence: Number(process.env.SEQ), unlockingBytecode: new Uint8Array() }],
        outputs: [{ value: 0n, lockingBytecode: lock(A) }],
      },
      sources: [sourceOf(coin)],
      fee: 0n,
    };
    settleFee(draft, fee => (draft.tx.outputs[0].value = coin.value - fee));
    const tx = signPersonal(draft, A.privateKey, A.publicKey);
    writeFileSync(new URL('probe.hex', dir), binToHex(encodeTransaction(tx)) + '\n');
    say(`coin ${coin.txid}:${coin.vout} height ${coin.height}, tip ${await chain('chipnet').tipHeight()}, sequence ${process.env.SEQ}, locktime ${process.env.LOCK ?? 0}`);
    try {
      await send(s, 'seqprobe', tx, draft.sources, `BIP68 probe, sequence ${process.env.SEQ}`);
    } catch (error) {
      s.log.pop();
      save(s);
      say(`refused: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /** RAW=<file with transaction hex>: broadcast those exact bytes to every Chipnet server and print the answer. */
  async rawsend() {
    const raw = readFileSync(process.env.RAW ?? '', 'utf8').trim();
    const tx = decodeTransaction(hexToBin(raw));
    try {
      say(`accepted: ${await broadcast(tx, 'chipnet')} (${txidOf(tx)})`);
    } catch (error) {
      say(`refused: ${error instanceof Error ? error.message : String(error)} (${txidOf(tx)})`);
    }
    await pause(3_000);
  },

  async venn(s) {
    const [A, B, C] = ['A', 'B', 'C'].map(n => keyOf(s, n));
    await prepVout0(s, A);
    const utxos = await coins(A);
    const { params, draft } = buildVennGenesis({
      utxos,
      publicKey: A.publicKey,
      network: 'chipnet',
      asset: { category: s.token!, utxos },
      members: [
        { publicKey: A.hex, roles: ROLE.SPEND | ROLE.VOTE | ROLE.REQUIRED | ROLE.HELPER, budgetMode: BUDGET.REFILL, budget: 10_000n, period: 86_400n, cap: 0n },
        { publicKey: B.hex, roles: ROLE.VOTE | ROLE.HELPER, budgetMode: 0, budget: 0n, period: 0n, cap: 0n },
        { publicKey: C.hex, roles: ROLE.VOTE | ROLE.HELPER, budgetMode: 0, budget: 0n, period: 0n, cap: 0n },
      ],
      settings: {
        membership: 1, spending: 1, recoveryRule: 1, governance: 1, payments: 1,
        recoveryOn: true, helpersNeeded: 2, waitUnits: 1, stopRule: STOP.VOTERS, strongNeeded: 0, strongWaitUnits: 0,
      },
      deposit: 200_000n,
      gas: 3_000n,
    });
    s.venn = { vaultCategory: params.vaultCategory, assetCategory: params.assetCategory! };
    await send(s, 'venn', signPersonal(draft, A.privateKey, A.publicKey), draft.sources, 'Venn v2 genesis: 3 members, 200000 token deposit');
    save(s);
  },

  async spend(s) {
    const [A, D] = ['A', 'D'].map(n => keyOf(s, n));
    const p = vennParams(s);
    const { official, coins: vc } = await readVenn(p);
    if (official.status !== 'official') throw new Error(`not official: ${official.reason}`);
    const seat = vc!.cards.findIndex(c => c.state.pkh === pkh(A));
    const draft = buildBudgetSpend(p, vc!, seat, await chainNow('chipnet'), lock(D), 5_000n, await feeOf(A));
    const tx = finalizeSpend(draft, A.hex, signVenn(draft, A.privateKey), signFeeInputs(draft, A.privateKey, A.publicKey));
    await send(s, 'spend', tx, draft.sources, 'budget spend of 5000 tokens to D');
  },

  async vote(s) {
    const [A, B, D] = ['A', 'B', 'D'].map(n => keyOf(s, n));
    const p = vennParams(s);
    const { coins: vc } = await readVenn(p);
    const built = buildVote(p, vc!, { payments: [{ to: lock(D), amount: 50_000n }] }, await feeOf(A));
    // The proposal travels as a code; each approver decodes, reads and signs it.
    const code = encodeProposal(proposalFor('vote', built.draft, 'Pay D 50000', built.need, built.requiredPkhs));
    const proposal = decodeProposal(code);
    const described = describeProposal(proposal, vc!, {}, n => `${n}`, 'chipnet');
    say(`proposal (${code.length} chars): ${described.lines.join(' ')}; need ${proposal.need}`);
    const approvals = [A, B].map(k => approvalFor(proposal, k.hex, signVenn(draftOf(proposal), k.privateKey)));
    const draft = draftOf(proposal);
    const tx = finalizeVote(
      draft,
      approvals.map(a => ({ publicKey: a.publicKey, signature: hexToBin(a.signature) })),
      signFeeInputs(draft, A.privateKey, A.publicKey),
    );
    await send(s, 'vote', tx, draft.sources, 'payment vote: 50000 tokens to D, approved by A and B');
  },

  async recovery(s) {
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map(n => keyOf(s, n));
    const p = vennParams(s);
    const { coins: vc } = await readVenn(p);
    const built = buildRecoveryRequest(p, vc!, pkh(C), D.hex, false, await feeOf(A));
    const proposal = decodeProposal(encodeProposal(proposalFor('recoveryRequest', built.draft, 'New key for C', built.need)));
    const draft = draftOf(proposal);
    const approvals = [A, B].map(k => approvalFor(proposal, k.hex, signVenn(draft, k.privateKey)));
    const tx = finalizeRecovery(
      draft,
      approvals.map(a => ({ publicKey: a.publicKey, signature: hexToBin(a.signature) })),
      signFeeInputs(draft, A.privateKey, A.publicKey),
    );
    await send(s, 'recovery', tx, draft.sources, 'recovery request: D replaces C, approved by helpers A and B');
    await transfer(s, 'fund-D', A, lock(D), 12_000n);
  },

  async complete(s) {
    const D = keyOf(s, 'D');
    const C = keyOf(s, 'C');
    const p = vennParams(s);
    const { coins: vc } = await readVenn(p);
    const card = vc!.cards.find(c => c.state.pkh === pkh(C))!;
    const elapsed = await chain('chipnet').lockElapsed(card.height, await chain('chipnet').tipHeight());
    say(`card height ${card.height}, elapsed ${elapsed}s of ${card.state.waitUnits * 512}s`);
    const draft = buildRecoveryComplete(p, vc!, pkh(C), elapsed, await feeOf(D));
    const tx = finalizeRecovery(draft, { publicKey: D.hex, signature: signVenn(draft, D.privateKey) }, signFeeInputs(draft, D.privateKey, D.publicKey));
    await send(s, 'complete', tx, draft.sources, 'recovery complete: D now holds the seat');
  },

  async circle(s) {
    const [A, B, C] = ['A', 'B', 'C'].map(n => keyOf(s, n));
    if (!s.circle) {
      await prepVout0(s, A);
      const { params, draft } = buildCircleGenesis({
        utxos: await coins(A),
        publicKey: A.publicKey,
        network: 'chipnet',
        assetCategory: s.token!,
        members: [A, B, C].map(pkh),
        contribution: 1_000n,
        period: 3_600n,
        start: await chainNow('chipnet'),
        gas: 2_000n,
      });
      s.circle = {
        circleCategory: params.circleCategory, assetCategory: params.assetCategory, contribution: '1000', period: '3600',
        start: params.start.toString(), members: params.members,
      };
      await send(s, 'circle', signPersonal(draft, A.privateKey, A.publicKey), draft.sources, 'Circle genesis: A, B, C; 1000 tokens a round');
      save(s);
    }
    const p = circleParams(s);
    for (let guard = 0; guard < 20; guard++) {
      const { official, coins: cc } = await readCircle(p);
      if (official.status !== 'official') throw new Error(`circle not official: ${official.reason}`);
      const st = cc!.state.state;
      if (st.round >= 3) {
        if (!cc!.money.length) {
          await transfer(s, 'stray', A, circleMoneyLocking(p), 1_500n, { category: s.token!, amount: 77n });
          continue;
        }
        const draft = buildSweep(p, cc!, await feeOf(A));
        await send(s, 'sweep', finalizeCircle(draft, signFeeInputs(draft, A.privateKey, A.publicKey)), draft.sources, 'sweep leftover to the last member (C)');
        return;
      }
      const unpaid = [0, 1, 2].find(i => !((st.paid >> i) & 1));
      if (unpaid !== undefined) {
        const draft = buildContribute(p, cc!, unpaid, await feeOf(A));
        await send(s, 'contribute', finalizeCircle(draft, signFeeInputs(draft, A.privateKey, A.publicKey)), draft.sources, `round ${st.round + 1}: seat ${unpaid + 1} paid (by A)`);
      } else {
        const draft = buildPayout(p, cc!, await chainNow('chipnet'), await feeOf(A));
        await send(s, 'payout', finalizeCircle(draft, signFeeInputs(draft, A.privateKey, A.publicKey)), draft.sources, `round ${st.round + 1}: pot to member ${st.round + 1}`);
      }
    }
  },
};

it.skipIf(Boolean(process.env.MAINNET))(`live chipnet step: ${process.env.STEP}`, async () => {
  const step = steps[process.env.STEP ?? ''];
  if (!step) throw new Error(`STEP must be one of ${Object.keys(steps).join(', ')}`);
  const s = load();
  try {
    await step(s);
  } finally {
    save(s);
    chain('chipnet').close?.();
  }
});

void equal;
