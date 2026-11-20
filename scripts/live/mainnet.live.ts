// Small live run of Venn v2 and Circle on BCH Mainnet with MUSD, using the app's own builders.
// Real money: every transaction is verified by the BCH 2026 VM before it is broadcast, each
// broadcast is recorded before the next step, and the last step returns every MUSD unit and every
// spendable satoshi to the owner's wallet. Keys and state live in the gitignored
// artifacts/live-mainnet/. Runs only with MAINNET=1, one step at a time:
//   MAINNET=1 STEP=keys|status|venn|spend|vote|circle|giveback RETURN_TO=<cashaddr> \
//     npx vitest run --config scripts/live/vitest.live.config.ts scripts/live/mainnet.live.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { binToHex, equal, hexToBin } from '../../src/core/bytes';
import { addressForLockingBytecode, lockingBytecodeForAddress } from '../../src/core/cashaddr';
import { hash160, publicKeyOf } from '../../src/core/crypto';
import { type Draft, type Utxo, DUST, p2pkhForPublicKey, settleFee, signPersonal, sourceOf, spendable, sum } from '../../src/core/draft';
import { type Output, SEQUENCE_FINAL, type Transaction, encodeTransaction, txidOf } from '../../src/core/tx';
import { MUSD } from '../../src/venn/asset';
import {
  buildBudgetSpend,
  buildVennFeePreparation,
  buildVennGenesis,
  buildVote,
  finalizeSpend,
  finalizeVote,
  signFeeInputs,
  signVenn,
} from '../../src/venn/build';
import { broadcast, chain, chainNow, readCircle, readVenn } from '../../src/venn/chain';
import type { CircleParams } from '../../src/venn/circle';
import { buildCircleGenesis, buildContribute, buildPayout, finalizeCircle } from '../../src/venn/circleBuild';
import type { VennParams } from '../../src/venn/contract';
import { BUDGET, ROLE, STOP } from '../../src/venn/layout';
import { approvalFor, decodeProposal, describeProposal, draftOf, encodeProposal, proposalFor } from '../../src/venn/proposal';
import { vmVerify } from '../../tests/helpers';

const NET = 'mainnet' as const;
/** Hard ceilings for this run: nothing here may move more than the owner approved. */
const MAX_MUSD = 100n; // 1.00 MUSD
const DEPOSIT = 60n; // 0.60 MUSD into the Venn
const SPEND = 10n; // 0.10 MUSD paid alone from A's budget
const CONTRIBUTION = 10n; // 0.10 MUSD per seat per Circle round

const dir = new URL('../../artifacts/live-mainnet/', import.meta.url);
const statePath = new URL('state.json', dir);
type Key = { privateKey: Uint8Array; publicKey: Uint8Array; hex: string };
interface State {
  keys: Record<string, string>;
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
const addr = (k: Key, tokens = false) => addressForLockingBytecode(lock(k), NET, tokens);
const pkh = (k: Key) => binToHex(hash160(k.publicKey));
const coins = (k: Key) => chain(NET).utxos(lock(k));
const musdOf = (u: Utxo[]) => sum(u.filter(x => x.token?.category === MUSD.category && !x.token.nft).map(x => x.token!.amount));
const say = (line: string) => process.stdout.write(line + '\n');
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const returnTo = () => {
  const to = process.env.RETURN_TO ?? '';
  if (!to.startsWith('bitcoincash:')) throw new Error('Set RETURN_TO to the owner’s Mainnet address');
  return lockingBytecodeForAddress(to, NET);
};

async function coinWhere(k: Key, match: (u: Utxo) => boolean) {
  for (let i = 0; i < 30; i++) {
    const found = (await coins(k)).find(match);
    if (found) return found;
    await pause(2_000);
  }
  throw new Error('The expected coin did not appear');
}

/** Verifies with the VM, records the txid, then broadcasts once to every Mainnet server. */
async function send(s: State, step: string, tx: Transaction, sources: Output[], note: string) {
  const ok = vmVerify(tx, sources);
  if (ok !== true) throw new Error(`${step}: VM rejected the transaction: ${ok}`);
  const txid = txidOf(tx);
  s.log.push({ step, txid, note });
  save(s);
  await broadcast(tx, NET);
  for (let i = 0; i < 30; i++) {
    try {
      await chain(NET).transactionHex(txid);
      break;
    } catch {
      await pause(2_000);
    }
  }
  await pause(1_500);
  say(`${step}: ${note} → ${txid} (${encodeTransaction(tx).length} bytes, fee ${sum(sources.map(o => o.value)) - sum(tx.outputs.map(o => o.value))} sats)`);
  return txid;
}

async function prepVout0(s: State, k: Key) {
  const own = spendable(await coins(k));
  if (own.some(u => u.vout === 0 && u.value > 20_000n)) return;
  const draft = buildVennFeePreparation(own.filter(u => u.vout !== 0).concat(own.filter(u => u.vout === 0)), k.publicKey);
  await send(s, 'prep', signPersonal(draft, k.privateKey, k.publicKey), draft.sources, `fee coin at output 0 for ${addr(k)}`);
}

/** Sends `value` sats (and optionally MUSD) from `from` to `to`; change goes back to `from`. */
async function transfer(s: State, step: string, from: Key, to: Uint8Array, value: bigint, tokens = 0n) {
  const all = await coins(from);
  const plain = spendable(all);
  const tokenCoins = tokens ? all.filter(u => u.token?.category === MUSD.category && !u.token.nft) : [];
  const tokenIn = musdOf(tokenCoins);
  if (tokenIn < tokens) throw new Error('Not enough MUSD');
  const chosen: Utxo[] = [...tokenCoins, ...plain];
  const outputs: Output[] = [
    { value, lockingBytecode: to, ...(tokens ? { token: { category: MUSD.category, amount: tokens } } : {}) },
    ...(tokenIn > tokens ? [{ value: 1_000n, lockingBytecode: lock(from), token: { category: MUSD.category, amount: tokenIn - tokens } }] : []),
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
  return send(s, step, signPersonal(draft, from.privateKey, from.publicKey), draft.sources, `${value} sats${tokens ? ` + ${tokens} MUSD cents` : ''}`);
}

const vennParams = (s: State): VennParams => ({ network: NET, ...s.venn! });
const circleParams = (s: State): CircleParams => {
  const c = s.circle!;
  return {
    network: NET, circleCategory: c.circleCategory as string, assetCategory: c.assetCategory as string,
    contribution: BigInt(c.contribution as string), period: BigInt(c.period as string), start: BigInt(c.start as string),
    members: c.members as string[],
  };
};
const feeOf = async (k: Key) => ({ utxos: await coins(k), publicKey: k.publicKey });

const steps: Record<string, (s: State) => Promise<void>> = {
  async keys(s) {
    for (const name of ['A', 'B'])
      if (!s.keys[name]) s.keys[name] = binToHex(crypto.getRandomValues(new Uint8Array(32)));
    save(s);
    for (const name of ['A', 'B']) say(`${name} ${addr(keyOf(s, name))} · tokens ${addr(keyOf(s, name), true)}`);
  },

  async status(s) {
    for (const name of Object.keys(s.keys)) {
      const u = await coins(keyOf(s, name));
      say(`${name}: ${sum(spendable(u).map(x => x.value))} sats in ${spendable(u).length} coins; MUSD cents ${musdOf(u)}; token coin sats ${sum(u.filter(x => x.token).map(x => x.value))}; unconfirmed ${u.filter(x => !x.height).length}`);
    }
    if (s.venn) {
      const { official, coins: vc } = await readVenn(vennParams(s));
      say(`venn: ${official.status} ${official.status === 'official' ? official.fingerprint : official.reason}; cards ${vc?.cards.length}; money ${sum((vc?.money ?? []).map(m => m.token?.amount ?? 0n))} cents`);
    }
    if (s.circle) {
      const { official, coins: cc } = await readCircle(circleParams(s));
      say(`circle: ${official.status}; state ${json(cc?.state.state)}; pot ${sum((cc?.money ?? []).map(m => m.token?.amount ?? 0n))}`);
    }
    say(`tip ${await chain(NET).tipHeight()}`);
  },

  /** A two-member Venn: A spends alone up to 0.20 MUSD a day; votes need both; B can help recover A. */
  async venn(s) {
    if (s.venn) throw new Error('This run already created its Venn');
    const [A, B] = ['A', 'B'].map(n => keyOf(s, n));
    if (musdOf(await coins(A)) < DEPOSIT) throw new Error('A holds too little MUSD');
    await prepVout0(s, A);
    await coinWhere(A, u => !u.token && u.vout === 0 && u.value > 20_000n);
    const utxos = await coins(A);
    const { params, draft } = buildVennGenesis({
      utxos,
      publicKey: A.publicKey,
      network: NET,
      asset: { category: MUSD.category, utxos },
      members: [
        { publicKey: A.hex, roles: ROLE.SPEND | ROLE.VOTE | ROLE.REQUIRED | ROLE.HELPER, budgetMode: BUDGET.REFILL, budget: 20n, period: 86_400n, cap: 0n },
        { publicKey: B.hex, roles: ROLE.VOTE | ROLE.HELPER, budgetMode: 0, budget: 0n, period: 0n, cap: 0n },
      ],
      settings: {
        membership: 2, spending: 2, recoveryRule: 2, governance: 2, payments: 2,
        recoveryOn: true, helpersNeeded: 1, waitUnits: 1, stopRule: STOP.VOTERS, strongNeeded: 0, strongWaitUnits: 0,
      },
      deposit: DEPOSIT,
      gas: 3_000n,
    });
    s.venn = { vaultCategory: params.vaultCategory, assetCategory: params.assetCategory! };
    await send(s, 'venn', signPersonal(draft, A.privateKey, A.publicKey), draft.sources, `Venn v2 genesis on Mainnet: A and B, ${DEPOSIT} MUSD cents`);
    save(s);
  },

  /** A pays 0.10 MUSD alone, within its budget, to the owner's token address. */
  async spend(s) {
    const A = keyOf(s, 'A');
    const p = vennParams(s);
    const { official, coins: vc } = await readVenn(p);
    if (official.status !== 'official') throw new Error(`not official: ${official.reason}`);
    const seat = vc!.cards.findIndex(c => c.state.pkh === pkh(A));
    const draft = buildBudgetSpend(p, vc!, seat, await chainNow(NET), returnTo(), SPEND, await feeOf(A));
    const tx = finalizeSpend(draft, A.hex, signVenn(draft, A.privateKey), signFeeInputs(draft, A.privateKey, A.publicKey));
    await send(s, 'spend', tx, draft.sources, `budget spend: ${SPEND} MUSD cents to the owner`);
  },

  /** Both members approve, by proposal and approval codes, paying the rest of the Venn to the owner. */
  async vote(s) {
    const [A, B] = ['A', 'B'].map(n => keyOf(s, n));
    const p = vennParams(s);
    const { coins: vc } = await readVenn(p);
    const rest = sum(vc!.money.map(m => m.token?.amount ?? 0n));
    if (rest <= 0n) throw new Error('The Venn holds no MUSD');
    const built = buildVote(p, vc!, { payments: [{ to: returnTo(), amount: rest }] }, await feeOf(A));
    const code = encodeProposal(proposalFor('vote', built.draft, `Pay the owner ${rest}`, built.need, built.requiredPkhs));
    const proposal = decodeProposal(code);
    say(`proposal (${code.length} chars): ${describeProposal(proposal, vc!, {}, n => `${n} MUSD cents`, NET).lines.join(' ')}; need ${proposal.need}`);
    const approvals = [A, B].map(k => approvalFor(proposal, k.hex, signVenn(draftOf(proposal), k.privateKey)));
    const draft = draftOf(proposal);
    const tx = finalizeVote(
      draft,
      approvals.map(a => ({ publicKey: a.publicKey, signature: hexToBin(a.signature) })),
      signFeeInputs(draft, A.privateKey, A.publicKey),
    );
    await send(s, 'vote', tx, draft.sources, `payment vote: ${rest} MUSD cents to the owner, approved by A and B`);
  },

  /** A two-member Circle, 0.10 MUSD a seat: two rounds, each paid out when both seats paid (A pays both). */
  async circle(s) {
    const [A, B] = ['A', 'B'].map(n => keyOf(s, n));
    if (!s.circle) {
      await prepVout0(s, A);
      await coinWhere(A, u => !u.token && u.vout === 0 && u.value > 20_000n);
      const { params, draft } = buildCircleGenesis({
        utxos: await coins(A),
        publicKey: A.publicKey,
        network: NET,
        assetCategory: MUSD.category,
        members: [A, B].map(pkh),
        contribution: CONTRIBUTION,
        period: 3_600n,
        start: await chainNow(NET),
        gas: 3_000n,
      });
      s.circle = {
        circleCategory: params.circleCategory, assetCategory: params.assetCategory, contribution: CONTRIBUTION.toString(),
        period: '3600', start: params.start.toString(), members: params.members,
      };
      await send(s, 'circle', signPersonal(draft, A.privateKey, A.publicKey), draft.sources, `Circle genesis on Mainnet: A, B; ${CONTRIBUTION} MUSD cents a round`);
      save(s);
    }
    const p = circleParams(s);
    for (let guard = 0; guard < 8; guard++) {
      const { official, coins: cc } = await readCircle(p);
      if (official.status !== 'official') throw new Error(`circle not official: ${official.reason}`);
      const st = cc!.state.state;
      if (st.round >= 2) return say('Circle finished: both rounds paid out');
      const unpaid = [0, 1].find(i => !((st.paid >> i) & 1));
      if (unpaid !== undefined) {
        const draft = buildContribute(p, cc!, unpaid, await feeOf(A));
        await send(s, 'contribute', finalizeCircle(draft, signFeeInputs(draft, A.privateKey, A.publicKey)), draft.sources, `round ${st.round + 1}: seat ${unpaid + 1} paid (by A)`);
      } else {
        const draft = buildPayout(p, cc!, await chainNow(NET), await feeOf(A));
        await send(s, 'payout', finalizeCircle(draft, signFeeInputs(draft, A.privateKey, A.publicKey)), draft.sources, `round ${st.round + 1}: pot to member ${st.round + 1}`);
      }
    }
  },

  /** Everything back to the owner: all MUSD to its token address, all spendable BCH to it too. */
  async giveback(s) {
    const to = returnTo();
    const tokenTo = lockingBytecodeForAddress(addressForLockingBytecode(to, NET, true), NET);
    for (const name of ['B', 'A']) {
      const k = keyOf(s, name);
      const all = await coins(k);
      const tokens = musdOf(all);
      const chosen = [...all.filter(u => u.token?.category === MUSD.category && !u.token.nft), ...spendable(all)];
      if (!chosen.length) continue;
      const outputs: Output[] = tokens ? [{ value: 1_000n, lockingBytecode: tokenTo, token: { category: MUSD.category, amount: tokens } }] : [];
      const draft: Draft = {
        tx: {
          version: 2,
          locktime: 0,
          inputs: chosen.map(u => ({ txid: u.txid, vout: u.vout, sequence: SEQUENCE_FINAL, unlockingBytecode: new Uint8Array() })),
          outputs: [...outputs, { value: 0n, lockingBytecode: to }],
        },
        sources: chosen.map(sourceOf),
        fee: 0n,
      };
      const total = sum(chosen.map(u => u.value)) - sum(outputs.map(o => o.value));
      settleFee(draft, fee => (draft.tx.outputs[draft.tx.outputs.length - 1].value = total - fee));
      if (draft.tx.outputs[draft.tx.outputs.length - 1].value < DUST) throw new Error(`${name} holds too little BCH to send back`);
      await send(s, 'giveback', signPersonal(draft, k.privateKey, k.publicKey), draft.sources, `${name} returns ${tokens} MUSD cents and ${draft.tx.outputs[draft.tx.outputs.length - 1].value} sats to the owner`);
    }
  },
};

it.skipIf(!process.env.MAINNET)(`live mainnet step: ${process.env.STEP}`, async () => {
  const step = steps[process.env.STEP ?? ''];
  if (!step) throw new Error(`STEP must be one of ${Object.keys(steps).join(', ')}`);
  const s = load();
  const A = s.keys.A ? keyOf(s, 'A') : null;
  if (A && musdOf(await coins(A)) > MAX_MUSD) throw new Error('A holds more MUSD than this run was approved for');
  try {
    await step(s);
  } finally {
    save(s);
    chain(NET).close?.();
  }
});

void equal;
void transfer;
