// The Mainnet run, offline: a two-member MUSD Venn with small amounts (a budget spend, then a vote
// paying out everything that is left) and a two-member Circle, every transaction checked by the VM
// exactly as scripts/live/mainnet.live.ts builds it.
import { expect, it } from 'vitest';
import { binToHex, hexToBin } from '../../src/core/bytes';
import { addressForLockingBytecode } from '../../src/core/cashaddr';
import { hash160 } from '../../src/core/crypto';
import { type Utxo, p2pkhForPublicKey, signPersonal } from '../../src/core/draft';
import type { Transaction } from '../../src/core/tx';
import { MUSD } from '../../src/venn/asset';
import { buildBudgetSpend, buildVennGenesis, buildVote, finalizeSpend, finalizeVote, signFeeInputs, signVenn } from '../../src/venn/build';
import { buildCircleGenesis, buildContribute, buildPayout, circleCoins, finalizeCircle } from '../../src/venn/circleBuild';
import { vennCoins } from '../../src/venn/coins';
import { vennAddress } from '../../src/venn/contract';
import { BUDGET, ROLE, STOP } from '../../src/venn/layout';
import { approvalFor, decodeProposal, describeProposal, draftOf, encodeProposal, proposalFor } from '../../src/venn/proposal';
import { utxoFrom, vmVerify } from '../helpers';
import { people, wallet } from './fixtures';

const A = people.creator;
const B = people.sara;
const owner = p2pkhForPublicKey(people.shop.publicKey);
const pkh = (k: { publicKey: Uint8Array }) => binToHex(hash160(k.publicKey));
/** Spends `tx`'s inputs out of `pool` and adds its outputs. */
const after = (pool: Utxo[], tx: Transaction) => [
  ...pool.filter(u => !tx.inputs.some(i => i.txid === u.txid && i.vout === u.vout)),
  ...tx.outputs.map((_, i) => utxoFrom(tx, i)),
];
const musd = (amount: bigint, vout: number, n: number): Utxo => ({
  ...wallet(A, 1_000n, n, vout),
  token: { category: MUSD.category, amount },
});

it('a small MUSD Venn on Mainnet: spend alone, then a vote pays out everything left', () => {
  const pool0 = [wallet(A, 200_000n, 1, 0), musd(100n, 1, 2)];
  const { params, draft } = buildVennGenesis({
    utxos: pool0,
    publicKey: A.publicKey,
    network: 'mainnet',
    asset: { category: MUSD.category, utxos: pool0 },
    members: [
      { publicKey: A.hex, roles: ROLE.SPEND | ROLE.VOTE | ROLE.REQUIRED | ROLE.HELPER, budgetMode: BUDGET.REFILL, budget: 20n, period: 86_400n, cap: 0n },
      { publicKey: B.hex, roles: ROLE.VOTE | ROLE.HELPER, budgetMode: 0, budget: 0n, period: 0n, cap: 0n },
    ],
    settings: {
      membership: 2, spending: 2, recoveryRule: 2, governance: 2, payments: 2,
      recoveryOn: true, helpersNeeded: 1, waitUnits: 1, stopRule: STOP.VOTERS, strongNeeded: 0, strongWaitUnits: 0,
    },
    deposit: 60n,
    gas: 3_000n,
  });
  const genesis = signPersonal(draft, A.privateKey, A.publicKey);
  expect(vmVerify(genesis, draft.sources)).toBe(true);
  expect(vennAddress(params, true)).toMatch(/^bitcoincash:r/);
  let pool = after(pool0, genesis);

  const coins1 = vennCoins(params, pool)!;
  const seat = coins1.cards.findIndex(c => c.state.pkh === pkh(A));
  const spend = buildBudgetSpend(params, coins1, seat, 1_800_000_000n, owner, 10n, { utxos: pool, publicKey: A.publicKey });
  const paid = finalizeSpend(spend, A.hex, signVenn(spend, A.privateKey), signFeeInputs(spend, A.privateKey, A.publicKey));
  expect(vmVerify(paid, spend.sources)).toBe(true);
  expect(paid.outputs[1].token).toEqual({ category: MUSD.category, amount: 10n });
  pool = after(pool, paid);

  const coins2 = vennCoins(params, pool)!;
  const rest = coins2.money.reduce((a, m) => a + (m.token?.amount ?? 0n), 0n);
  expect(rest).toBe(50n);
  const built = buildVote(params, coins2, { payments: [{ to: owner, amount: rest }] }, { utxos: pool, publicKey: A.publicKey });
  const proposal = decodeProposal(encodeProposal(proposalFor('vote', built.draft, 'Pay the owner', built.need, built.requiredPkhs)));
  expect(describeProposal(proposal, coins2, {}, n => `${n}`, 'mainnet').lines[0]).toMatch(/^Pay 50 to bitcoincash:/);
  const approvals = [A, B].map(k => approvalFor(proposal, k.hex, signVenn(draftOf(proposal), k.privateKey)));
  const voteDraft = draftOf(proposal);
  const vote = finalizeVote(
    voteDraft,
    approvals.map(a => ({ publicKey: a.publicKey, signature: hexToBin(a.signature) })),
    signFeeInputs(voteDraft, A.privateKey, A.publicKey),
  );
  expect(vmVerify(vote, voteDraft.sources)).toBe(true);
  pool = after(pool, vote);
  expect(vennCoins(params, pool)!.money.reduce((a, m) => a + (m.token?.amount ?? 0n), 0n)).toBe(0n);
  expect(addressForLockingBytecode(owner, 'mainnet', true)).toMatch(/^bitcoincash:z/);
});

it('a two-member MUSD Circle on Mainnet runs both rounds', () => {
  let pool: Utxo[] = [wallet(A, 200_000n, 3, 0), musd(40n, 1, 4)];
  const { params, draft } = buildCircleGenesis({
    utxos: pool,
    publicKey: A.publicKey,
    network: 'mainnet',
    assetCategory: MUSD.category,
    members: [A, B].map(pkh),
    contribution: 10n,
    period: 3_600n,
    start: 1_800_000_000n,
    gas: 3_000n,
  });
  const genesis = signPersonal(draft, A.privateKey, A.publicKey);
  expect(vmVerify(genesis, draft.sources)).toBe(true);
  pool = after(pool, genesis);
  for (let step = 0; step < 6; step++) {
    const cc = circleCoins(params, pool)!;
    const st = cc.state.state;
    if (st.round >= 2) break;
    const unpaid = [0, 1].find(i => !((st.paid >> i) & 1));
    const d = unpaid !== undefined
      ? buildContribute(params, cc, unpaid, { utxos: pool, publicKey: A.publicKey })
      : buildPayout(params, cc, 1_800_000_000n, { utxos: pool, publicKey: A.publicKey });
    const tx = finalizeCircle(d, signFeeInputs(d, A.privateKey, A.publicKey));
    expect(vmVerify(tx, d.sources)).toBe(true);
    pool = after(pool, tx);
  }
  expect(circleCoins(params, pool)!.state.state.round).toBe(2);
});
