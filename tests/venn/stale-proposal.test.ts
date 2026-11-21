// QA 21 Nov (B2): a proposal made from an old view of the Venn was rejected as out of date on the
// approver's phone. The proposer's app now spots it and can make it again from current coins.
import { expect, it } from 'vitest';
import { binToHex } from '../../src/core/bytes';
import { hash160 } from '../../src/core/crypto';
import { p2pkhForPublicKey } from '../../src/core/draft';
import { buildBudgetSpend, buildVote, finalizeSpend, signFeeInputs, signVenn } from '../../src/venn/build';
import { vennCoins } from '../../src/venn/coins';
import { moneyLocking, vennLocking } from '../../src/venn/contract';
import { BUDGET, ROLE } from '../../src/venn/layout';
import { describeProposal, proposalFor, proposalIsCurrent } from '../../src/venn/proposal';
import { decodeRemake, encodeRemake } from '../../src/venn/remake';
import { utxoFrom, vmVerify } from '../helpers';
import { feeWallet, makeVault, member, people } from './fixtures';

const { creator, sara } = people;
const VH = ROLE.VOTE | ROLE.HELPER;

it('a proposal goes out of date once the Venn spends the coins it used, and the app can tell', () => {
  const v = makeVault({
    members: [
      member(creator, ROLE.SPEND | VH, { budgetMode: BUDGET.REFILL, budget: 50_000n, period: 86_400n }),
      member(sara, ROLE.SPEND | VH, { budgetMode: BUDGET.REFILL, budget: 50_000n, period: 86_400n }),
    ],
  });
  const change = { payments: [{ to: p2pkhForPublicKey(sara.publicKey), amount: 10_000n }] };
  const vote = buildVote(v.params, v.coins, change, feeWallet(creator));
  const proposal = proposalFor('vote', vote.draft, 'Pay 10,000', vote.need);
  expect(proposalIsCurrent(proposal, v.coins)).toBe(true);

  // Sara pays alone from her budget before the vote is approved (as Lee did).
  const seat = v.coins.cards.findIndex(c => c.state.pkh === binToHex(hash160(sara.publicKey)));
  const spend = buildBudgetSpend(v.params, v.coins, seat, 1_800_000_000n, p2pkhForPublicKey(creator.publicKey), 5_000n, feeWallet(sara));
  const tx = finalizeSpend(spend, sara.hex, signVenn(spend, sara.privateKey), signFeeInputs(spend, sara.privateKey, sara.publicKey));
  expect(vmVerify(tx, spend.sources)).toBe(true);
  const locks = [binToHex(vennLocking(v.params)), binToHex(moneyLocking(v.params))];
  const kept = v.utxos.filter(u => !tx.inputs.some(i => i.txid === u.txid && i.vout === u.vout));
  const fresh = tx.outputs.map((o, i) => [o, i] as const).filter(([o]) => locks.includes(binToHex(o.lockingBytecode))).map(([, i]) => utxoFrom(tx, i, 300));
  const now = vennCoins(v.params, [...kept, ...fresh])!;

  expect(proposalIsCurrent(proposal, now)).toBe(false);
  expect(() => describeProposal(proposal, now, {}, String, 'chipnet')).toThrow(/Refresh and re-propose/);

  // Remade from the current coins, it is current again.
  const remade = buildVote(v.params, now, change, feeWallet(creator, 901));
  expect(proposalIsCurrent(proposalFor('vote', remade.draft, 'Pay 10,000', remade.need), now)).toBe(true);
});

it('remake data survives storage, bytes and bigints included', () => {
  const to = p2pkhForPublicKey(sara.publicKey);
  const r = decodeRemake(
    encodeRemake({ kind: 'vote', change: { payments: [{ to, amount: 123n }], settings: { stopRule: 1 } }, title: 'Pay', names: { ab: 'Lee' } }),
  );
  expect(r.kind).toBe('vote');
  if (r.kind !== 'vote') return;
  expect(r.change.payments![0].amount).toBe(123n);
  expect(binToHex(r.change.payments![0].to)).toBe(binToHex(to));
  expect(r.change.settings).toEqual({ stopRule: 1 });
  expect(r.names).toEqual({ ab: 'Lee' });
});
