// Regression tests for the Venn v2 review findings. Each crafted transaction is judged by
// the real BCH 2026 VM with consensus rules only, as a miner could include it.
import { describe, expect, it } from 'vitest';
import { binToHex, concat } from '../../src/core/bytes';
import { hash160 } from '../../src/core/crypto';
import { p2pkhForPublicKey, type Draft } from '../../src/core/draft';
import type { Output, Transaction } from '../../src/core/tx';
import { availableBudget } from '../../src/venn/budget';
import {
  type VoteChange,
  buildBudgetSpend,
  buildRecoveryCancelByVote,
  buildRecoveryComplete,
  buildRecoveryRequest,
  buildVote,
  finalizeRecovery,
  finalizeSpend,
  finalizeVenn,
  finalizeVote,
  signFeeInputs,
  signVenn,
} from '../../src/venn/build';
import { vennCoins } from '../../src/venn/coins';
import { moneyLocking, vennLocking } from '../../src/venn/contract';
import {
  BUDGET,
  type CardState,
  ROLE,
  type RulesState,
  STOP,
  decodeCardState,
  decodeRulesState,
  encodeCardState,
  encodeRulesState,
} from '../../src/venn/layout';
import { key, utxoFrom, vmVerify } from '../helpers';
import { feeWallet, makeVault, member, people, withRawApprovals } from './fixtures';

const { creator, sara, ali, omar, lina, newPhone, shop } = people;
const extra = key(30);
const five = [creator, sara, ali, omar, lina];
const VH = ROLE.VOTE | ROLE.HELPER;
type Key = ReturnType<typeof key>;
const pkhOf = (k: { publicKey: Uint8Array }) => binToHex(hash160(k.publicKey));
const consensus = (tx: Transaction, sources: Output[]) => vmVerify(tx, sources, false);
const T0 = 1_800_000_000n;

const vaultOf = (settings: Parameters<typeof makeVault>[0]['settings'] = {}, members = five.map(k => member(k, VH))) =>
  makeVault({ members, settings: { helpersNeeded: 2, strongNeeded: 3, ...settings } });
type V = ReturnType<typeof vaultOf>;

/** A vote signed by `signers`, with an optional crafted change before anyone signs. */
const vote = (v: V, change: VoteChange, signers: Key[], tweak?: (t: Transaction, s: Output[]) => void) => {
  const built = buildVote(v.params, v.coins, change, feeWallet(creator));
  tweak?.(built.draft.tx, built.draft.sources);
  const base = signFeeInputs(built.draft, creator.privateKey, creator.publicKey);
  return { ...built, tx: withRawApprovals(built.draft, signers, base) };
};

const setCardAt = (t: Transaction, i: number, f: (c: CardState) => CardState) => {
  t.outputs[i] = {
    ...t.outputs[i],
    token: {
      ...t.outputs[i].token!,
      nft: { capability: 'mutable', commitment: encodeCardState(f(decodeCardState(t.outputs[i].token!.nft!.commitment))) },
    },
  };
};
const setCardHex = (t: Transaction, i: number, f: (hex: string) => string) => {
  t.outputs[i] = {
    ...t.outputs[i],
    token: { ...t.outputs[i].token!, nft: { capability: 'mutable', commitment: f(t.outputs[i].token!.nft!.commitment) } },
  };
};
const setRules = (t: Transaction, f: (r: RulesState) => RulesState) => {
  t.outputs[0] = {
    ...t.outputs[0],
    token: {
      ...t.outputs[0].token!,
      nft: { capability: 'minting', commitment: encodeRulesState(f(decodeRulesState(t.outputs[0].token!.nft!.commitment))) },
    },
  };
};
const cardIndex = (t: Transaction, k: { publicKey: Uint8Array }) =>
  t.outputs.findIndex(o => o.token?.nft?.capability === 'mutable' && o.token.nft.commitment.startsWith(pkhOf(k)));

const after = (v: V, tx: Transaction): V => {
  const locks = [binToHex(vennLocking(v.params)), binToHex(moneyLocking(v.params))];
  const kept = v.utxos.filter(u => !tx.inputs.some(i => i.txid === u.txid && i.vout === u.vout));
  const fresh = tx.outputs.flatMap((o, i) => (locks.includes(binToHex(o.lockingBytecode)) ? [utxoFrom(tx, i, 200)] : []));
  const utxos = [...kept, ...fresh];
  return { ...v, utxos, coins: vennCoins(v.params, utxos)! };
};

const spender = (budget = 50_000n) =>
  member(sara, ROLE.SPEND | VH, { budgetMode: BUDGET.REFILL, budget, period: 86_400n });

describe('v2: budgets need the spending rule', () => {
  const strictSpending = { membership: 1, spending: 2, payments: 2 as const };

  it('adding a member who spends alone needs the spending rule, not just membership', () => {
    const v = vaultOf(strictSpending);
    const change: VoteChange = {
      add: [member(extra, ROLE.SPEND | ROLE.VOTE, { budgetMode: BUDGET.REFILL, budget: 10n ** 12n, period: 1n })],
    };
    expect(buildVote(v.params, v.coins, change, feeWallet(creator)).touched).toContain('spending');
    const majority = vote(v, change, [creator, sara, ali]);
    expect(majority.need).toBe(5);
    expect(consensus(majority.tx, majority.draft.sources)).not.toBe(true);
    // Crafted: the same budget card, but the transaction claims only three approvals are needed.
    const crafted = vote(v, { add: [member(extra, ROLE.VOTE)] }, [creator, sara, ali], t =>
      setCardAt(t, cardIndex(t, extra), c => ({ ...c, roles: ROLE.SPEND | ROLE.VOTE, budgetMode: BUDGET.REFILL, budget: 10n ** 12n, left: 10n ** 12n, period: 1n })),
    );
    expect(consensus(crafted.tx, crafted.draft.sources)).not.toBe(true);
    const everyone = vote(v, change, five);
    expect(vmVerify(everyone.tx, everyone.draft.sources)).toBe(true);
  });

  it('giving an existing member the right to spend alone needs the spending rule', () => {
    const v = vaultOf(strictSpending);
    const control = vote(v, { update: [{ pkh: pkhOf(omar), roles: VH | ROLE.REQUIRED }] }, [creator, sara, ali]);
    expect(control.need).toBe(3);
    expect(vmVerify(control.tx, control.draft.sources)).toBe(true);
    const grant = { update: [{ pkh: pkhOf(omar), roles: VH | ROLE.SPEND, budgetMode: BUDGET.REFILL, budget: 9n, period: 9n }] };
    const three = vote(v, grant, [creator, sara, ali]);
    expect(three.need).toBe(5);
    expect(consensus(three.tx, three.draft.sources)).not.toBe(true);
  });

  it('handing a budget to another key needs the spending rule', () => {
    const v = vaultOf(strictSpending, [member(creator, VH), spender(), member(ali, VH), member(omar, VH), member(lina, VH)]);
    // A majority vote that drops Sara's helper role, then also rewrites her key to Extra's.
    const change = { update: [{ pkh: pkhOf(sara), roles: ROLE.SPEND | ROLE.VOTE }] };
    const control = vote(v, change, [creator, ali, omar]);
    expect(vmVerify(control.tx, control.draft.sources)).toBe(true);
    const r = vote(v, change, [creator, ali, omar], t =>
      setCardHex(t, cardIndex(t, sara), hex => pkhOf(extra) + hex.slice(40)),
    );
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
  });
});

describe('v2: every card a vote writes is valid', () => {
  const crafted = (f: (c: CardState) => CardState, counts?: (r: RulesState) => RulesState) => {
    const v = vaultOf();
    return vote(v, { add: [member(extra, VH)] }, [creator, sara, ali], t => {
      setCardAt(t, cardIndex(t, extra), f);
      if (counts) setRules(t, counts);
    });
  };

  it('a required member who does not vote is refused, so votes can never deadlock', () => {
    const r = crafted(c => ({ ...c, roles: ROLE.REQUIRED | ROLE.HELPER }), x => ({ ...x, voters: x.voters - 1, required: 1 }));
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
    const control = crafted(c => ({ ...c, roles: ROLE.VOTE | ROLE.REQUIRED | ROLE.HELPER }), x => ({ ...x, required: 1 }));
    expect(vmVerify(control.tx, control.draft.sources)).toBe(true);
  });

  it('unknown budget modes, empty periods and budgets without the spend role are refused', () => {
    const modeless = crafted(c => ({ ...c, roles: VH | ROLE.SPEND, budgetMode: 99, budget: 5n, left: 5n, period: 0n }));
    expect(consensus(modeless.tx, modeless.draft.sources)).not.toBe(true);
    const noPeriod = crafted(c => ({ ...c, roles: VH | ROLE.SPEND, budgetMode: BUDGET.REFILL, budget: 5n, left: 5n, period: 0n }));
    expect(consensus(noPeriod.tx, noPeriod.draft.sources)).not.toBe(true);
    const noRole = crafted(c => ({ ...c, budgetMode: BUDGET.REFILL, budget: 5n, left: 5n, period: 5n }));
    expect(consensus(noRole.tx, noRole.draft.sources)).not.toBe(true);
  });

  it('negative or non-canonical amounts are refused', () => {
    const v = vaultOf();
    const negative = vote(v, { add: [member(extra, VH)] }, [creator, sara, ali], t =>
      setCardHex(t, cardIndex(t, extra), hex => {
        const card = decodeCardState(encodeCardState({ ...decodeCardState(hex), roles: VH | ROLE.SPEND, budgetMode: 1, budget: 5n, left: 5n, period: 5n }));
        const raw = encodeCardState(card);
        // Cap = negative zero (0x…80): equal to 0 for the VM, but not the canonical encoding.
        return raw.slice(0, 76) + '0000000000000080' + raw.slice(92);
      }),
    );
    expect(consensus(negative.tx, negative.draft.sources)).not.toBe(true);
  });

  it('a new card cannot arrive with a recovery already pointing at someone', () => {
    const r = crafted(c => ({ ...c, recovery: 2, newPkh: '44'.repeat(20), waitUnits: 1 }));
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
  });
});

describe('v2: recovery settings stay workable', () => {
  const recoveryVote = (f: (r: RulesState) => RulesState) => {
    const v = vaultOf({ stopRule: STOP.BOTH, waitUnits: 3, strongWaitUnits: 6 });
    return vote(v, { settings: { waitUnits: 4 } }, [creator, sara, ali], t => setRules(t, f));
  };

  it('a genuine recovery settings change passes', () => {
    const ok = recoveryVote(r => r);
    expect(vmVerify(ok.tx, ok.draft.sources)).toBe(true);
  });

  it('zero waits, a weaker strong path or unreachable helper counts are refused', () => {
    for (const bad of [
      (r: RulesState) => ({ ...r, waitUnits: 0 }),
      (r: RulesState) => ({ ...r, strongNeeded: 1 }),
      (r: RulesState) => ({ ...r, strongWaitUnits: 1 }),
      (r: RulesState) => ({ ...r, helpersNeeded: 6, strongNeeded: 6 }),
      (r: RulesState) => ({ ...r, recoveryOn: false }),
    ]) {
      const r = recoveryVote(bad);
      expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
    }
  });
});

describe('v2: approvals are exact and signed for this transaction only', () => {
  it('surplus approvals are refused, so nobody can drop one and change the txid', () => {
    const v = vaultOf();
    const r = vote(v, { add: [member(extra, VH)] }, [creator, sara, ali, omar]);
    expect(r.need).toBe(3);
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
    const exact = vote(v, { add: [member(extra, VH)] }, [creator, sara, ali]);
    expect(vmVerify(exact.tx, exact.draft.sources)).toBe(true);
  });

  it('finalizing picks required members first and exactly the number needed', () => {
    const v = makeVault({
      members: [member(creator, VH | ROLE.REQUIRED), member(sara, VH), member(ali, VH), member(omar, VH), member(lina, VH)],
      settings: { helpersNeeded: 2, strongNeeded: 3 },
    });
    const built = buildVote(v.params, v.coins, { add: [member(extra, VH)] }, feeWallet(creator));
    const approvals = [sara, ali, omar, lina, creator].map(k => ({ publicKey: k.hex, signature: signVenn(built.draft, k.privateKey) }));
    const tx = finalizeVote(built.draft, approvals, signFeeInputs(built.draft, creator.privateKey, creator.publicKey));
    expect(vmVerify(tx, built.draft.sources)).toBe(true);
  });

  it('plan bytes are canonical', () => {
    const v = vaultOf();
    const built = buildVote(v.params, v.coins, { add: [member(extra, VH)] }, feeWallet(creator));
    const approvals = [creator, sara, ali].map(k => ({ publicKey: k.hex, signature: signVenn(built.draft, k.privateKey) }));
    const base = signFeeInputs(built.draft, creator.privateKey, creator.publicKey);
    expect(vmVerify(finalizeVote(built.draft, approvals, base), built.draft.sources)).toBe(true);
    for (const at of [0, built.draft.venn!.lead[1].length - 1]) {
      const plan = Uint8Array.from(built.draft.venn!.lead[1]);
      plan[at] = 0x02;
      const draft: Draft = { ...built.draft, venn: { ...built.draft.venn!, lead: [built.draft.venn!.lead[0], plan] } };
      expect(consensus(finalizeVote(draft, approvals, base), built.draft.sources)).not.toBe(true);
    }
  });

  it('only ALL|UTXOS signatures count', () => {
    const v = vaultOf();
    const built = buildVote(v.params, v.coins, { add: [member(extra, VH)] }, feeWallet(creator));
    const base = signFeeInputs(built.draft, creator.privateKey, creator.publicKey);
    const entry = (k: Key, hashType: number) => {
      const index = built.draft.sources.findIndex(s => s.token?.nft?.commitment.startsWith(pkhOf(k)));
      const sig = signVenn(built.draft, k.privateKey);
      sig[sig.length - 1] = hashType;
      return concat(Uint8Array.of(index), k.publicKey, Uint8Array.of(sig.length), sig);
    };
    for (const type of [0x41, 0x42, 0x43, 0xc1, 0xe1]) {
      const blob = concat(entry(creator, 0x61), entry(sara, 0x61), entry(ali, type));
      const tx = finalizeVenn(built.draft, [blob, built.draft.venn!.lead[1]], base);
      expect(consensus(tx, built.draft.sources)).not.toBe(true);
    }
  });

  it('a budget spend signed with another hash type is refused', () => {
    const v = makeVault({ members: [member(creator, VH), spender()] });
    const draft = buildBudgetSpend(v.params, v.coins, 1, T0, p2pkhForPublicKey(shop.publicKey), 1_000n, feeWallet(sara));
    const sig = signVenn(draft, sara.privateKey);
    const base = signFeeInputs(draft, sara.privateKey, sara.publicKey);
    expect(vmVerify(finalizeSpend(draft, sara.hex, sig, base), draft.sources)).toBe(true);
    const other = Uint8Array.from(sig);
    other[other.length - 1] = 0x41;
    expect(consensus(finalizeSpend(draft, sara.hex, other, base), draft.sources)).not.toBe(true);
  });
});

describe('v2: a pending recovery is not restarted by others', () => {
  const recoveryVault = () =>
    makeVault({
      members: [member(creator, VH), member(sara, VH), member(ali, VH), member(omar, VH), member(lina, VH)],
      settings: { stopRule: STOP.VOTERS, helpersNeeded: 2, waitUnits: 3, strongNeeded: 0, strongWaitUnits: 0 },
    });
  const pendingOn = (v: V, target: Key, helpers: Key[]) => {
    const built = buildRecoveryRequest(v.params, v.coins, pkhOf(target), newPhone.hex, false, feeWallet(sara));
    const approvals = helpers.map(k => ({ publicKey: k.hex, signature: signVenn(built.draft, k.privateKey) }));
    const tx = finalizeRecovery(built.draft, approvals, signFeeInputs(built.draft, sara.privateKey, sara.publicKey));
    expect(vmVerify(tx, built.draft.sources)).toBe(true);
    return after(v, tx);
  };

  it('the app leaves pending cards out of other transactions', () => {
    const v = pendingOn(recoveryVault(), creator, [sara, ali]);
    const pendingCard = v.coins.cards.find(c => c.state.pkh === pkhOf(creator))!;
    const usesPending = (d: Draft) => d.tx.inputs.some(i => i.txid === pendingCard.txid && i.vout === pendingCard.vout);
    const req = buildRecoveryRequest(v.params, v.coins, pkhOf(sara), key(41).hex, false, feeWallet(ali));
    expect(usesPending(req.draft)).toBe(false);
    const built = buildVote(v.params, v.coins, { add: [member(extra, VH)] }, feeWallet(sara));
    expect(usesPending(built.draft)).toBe(false);
  });

  it('the contract refuses a recovery request or vote that carries a pending card along', () => {
    const fresh = recoveryVault();
    const v = pendingOn(fresh, creator, [sara, ali]);
    const pendingCard = v.coins.cards.find(c => c.state.pkh === pkhOf(creator))!;
    // Rebuild a request for Sara from the state before the first request, then swap in the
    // pending card as an unchanged bystander: the shape of a wait-resetting transaction.
    const req = buildRecoveryRequest(fresh.params, fresh.coins, pkhOf(sara), key(41).hex, false, feeWallet(ali));
    const idx = req.draft.sources.findIndex(s => s.token?.nft?.commitment.startsWith(pkhOf(creator)));
    expect(idx).toBeGreaterThan(0);
    req.draft.tx.inputs[idx] = { ...req.draft.tx.inputs[idx], txid: pendingCard.txid, vout: pendingCard.vout };
    req.draft.sources[idx] = { value: pendingCard.value, lockingBytecode: pendingCard.lockingBytecode, token: pendingCard.token };
    req.draft.tx.outputs[idx] = { ...req.draft.tx.outputs[idx], token: pendingCard.token };
    req.draft.tx.inputs[0] = { ...req.draft.tx.inputs[0], txid: v.coins.rules.txid, vout: v.coins.rules.vout };
    const approvals = [ali, omar].map(k => ({ publicKey: k.hex, signature: signVenn(req.draft, k.privateKey) }));
    const tx = finalizeRecovery(req.draft, approvals, signFeeInputs(req.draft, ali.privateKey, ali.publicKey));
    expect(consensus(tx, req.draft.sources)).not.toBe(true);
  });

  it('a pending card can still be removed, and voters can still stop the request', () => {
    const v = pendingOn(recoveryVault(), creator, [sara, ali]);
    const removed = vote(v, { remove: [pkhOf(creator)] }, [sara, ali, omar]);
    expect(vmVerify(removed.tx, removed.draft.sources)).toBe(true);
    const stop = buildRecoveryCancelByVote(v.params, v.coins, pkhOf(creator), feeWallet(sara));
    const approvals = [sara, ali, omar].map(k => ({ publicKey: k.hex, signature: signVenn(stop.draft, k.privateKey) }));
    const tx = finalizeRecovery(stop.draft, approvals, signFeeInputs(stop.draft, sara.privateKey, sara.publicKey));
    expect(vmVerify(tx, stop.draft.sources)).toBe(true);
  });
});

describe('v2: money lives at its own address and only moves under the Venn', () => {
  it('a money coin cannot be spent without the Venn leading', () => {
    const v = makeVault({ members: [member(creator, VH), spender()] });
    const draft = buildBudgetSpend(v.params, v.coins, 1, T0, p2pkhForPublicKey(shop.publicKey), 1_000n, feeWallet(sara));
    const base = signFeeInputs(draft, sara.privateKey, sara.publicKey);
    const tx = finalizeSpend(draft, sara.hex, signVenn(draft, sara.privateKey), base);
    expect(vmVerify(tx, draft.sources)).toBe(true);
    // Move the fee coin to input 0: the money coin's VennMoney check must now fail.
    const feeAt = draft.sources.findIndex(s => s.lockingBytecode.length === 25);
    const swapped: Transaction = { ...tx, inputs: [tx.inputs[feeAt], ...tx.inputs.filter((_, i) => i !== feeAt)] };
    const sources = [draft.sources[feeAt], ...draft.sources.filter((_, i) => i !== feeAt)];
    expect(consensus(swapped, sources)).not.toBe(true);
  });

  it('another Venn cannot lead a transaction that spends this Venn’s money', () => {
    const mine = makeVault({ members: [member(creator, VH), spender()] });
    const theirs = makeVault({ members: [member(creator, VH), spender(10n ** 9n)], deposit: 10_000n });
    const draft = buildBudgetSpend(theirs.params, theirs.coins, 1, T0, p2pkhForPublicKey(shop.publicKey), 1_000n, feeWallet(sara));
    const money = mine.coins.money[0];
    draft.tx.inputs.splice(1, 0, { txid: money.txid, vout: money.vout, sequence: 0xffffffff, unlockingBytecode: new Uint8Array() });
    draft.sources.splice(1, 0, { value: money.value, lockingBytecode: money.lockingBytecode, token: money.token });
    draft.tx.outputs[1] = { ...draft.tx.outputs[1], value: draft.tx.outputs[1].value + money.value };
    const base = signFeeInputs(draft, sara.privateKey, sara.publicKey);
    const tx = finalizeSpend(draft, sara.hex, signVenn(draft, sara.privateKey), base);
    tx.inputs[1] = { ...tx.inputs[1], unlockingBytecode: finalizeVenn({ ...draft, venn: { ...draft.venn!, params: mine.params } }, [], base).inputs[1].unlockingBytecode };
    expect(consensus(tx, draft.sources)).not.toBe(true);
  });

  it('a recovery completion cannot carry money along', () => {
    const v = makeVault({
      members: [member(creator, VH), member(sara, VH), member(ali, VH)],
      settings: { stopRule: STOP.VOTERS, helpersNeeded: 2, waitUnits: 1, strongNeeded: 0, strongWaitUnits: 0 },
    });
    const req = buildRecoveryRequest(v.params, v.coins, pkhOf(creator), newPhone.hex, false, feeWallet(sara));
    const approvals = [sara, ali].map(k => ({ publicKey: k.hex, signature: signVenn(req.draft, k.privateKey) }));
    const pending = after(v, finalizeRecovery(req.draft, approvals, signFeeInputs(req.draft, sara.privateKey, sara.publicKey)));
    const draft = buildRecoveryComplete(pending.params, pending.coins, pkhOf(creator), 10_000, feeWallet(newPhone));
    const money = pending.coins.money[0];
    draft.tx.inputs.splice(1, 0, { txid: money.txid, vout: money.vout, sequence: 0xffffffff, unlockingBytecode: new Uint8Array() });
    draft.sources.splice(1, 0, { value: money.value, lockingBytecode: money.lockingBytecode, token: money.token });
    draft.tx.outputs.push({ value: money.value, lockingBytecode: p2pkhForPublicKey(newPhone.publicKey) });
    const tx = finalizeRecovery(draft, { publicKey: newPhone.hex, signature: signVenn(draft, newPhone.privateKey) }, signFeeInputs(draft, newPhone.privateKey, newPhone.publicKey));
    expect(consensus(tx, draft.sources)).not.toBe(true);
  });

  it('a removed card’s BCH counts as money: it needs the payments rule to leave', () => {
    const v = vaultOf({ membership: 1, payments: 2 as const });
    const ok = vote(v, { remove: [pkhOf(lina)] }, [creator, sara, ali]);
    expect(vmVerify(ok.tx, ok.draft.sources)).toBe(true);
    const leak = vote(v, { remove: [pkhOf(lina)] }, [creator, sara, ali], t => {
      const back = t.outputs.findIndex(o => binToHex(o.lockingBytecode) === binToHex(moneyLocking(v.params)));
      t.outputs[back] = { ...t.outputs[back], lockingBytecode: p2pkhForPublicKey(shop.publicKey) };
    });
    expect(consensus(leak.tx, leak.draft.sources)).not.toBe(true);
  });
});

describe('v2: refilling budgets lose nothing to rounding', () => {
  it('only the time a refill used is consumed', () => {
    const card: CardState = {
      pkh: '11'.repeat(20), roles: ROLE.SPEND, budgetMode: BUDGET.REFILL, budget: 100n, period: 86_400n, cap: 0n,
      left: 0n, last: T0, recovery: 0, newPkh: '00'.repeat(20), waitUnits: 0,
    };
    // 1,000 seconds refills 1.157… units: 1 unit is given and only 864 seconds are used up.
    const first = availableBudget(card, T0 + 1_000n);
    expect(first).toEqual({ available: 1n, nextLast: T0 + 864n });
    // Many small spends, every 1,000 seconds, add up to the same as one spend at the end.
    let c = card;
    let total = 0n;
    for (let k = 1n; k <= 80n; k++) {
      const a = availableBudget(c, T0 + k * 1_000n);
      total += a.available;
      c = { ...c, left: 0n, last: a.nextLast };
    }
    expect(total).toBe((100n * 80_000n) / 86_400n);
  });

  it('the contract agrees with the app on the new clock', () => {
    const budget = 200_000n;
    const period = 86_400_000n;
    const v = makeVault({ members: [member(creator, VH), member(sara, ROLE.SPEND | VH, { budgetMode: BUDGET.REFILL, budget, period })] });
    let w = v;
    const s1 = buildBudgetSpend(w.params, w.coins, 1, T0, p2pkhForPublicKey(shop.publicKey), budget, feeWallet(sara));
    const tx1 = finalizeSpend(s1, sara.hex, signVenn(s1, sara.privateKey), signFeeInputs(s1, sara.privateKey, sara.publicKey));
    expect(vmVerify(tx1, s1.sources)).toBe(true);
    w = after(w, tx1);
    // 250,000 seconds refill 578.7 satoshis: 578 are given and 249,696 seconds are used up.
    const s2 = buildBudgetSpend(w.params, w.coins, 1, T0 + 250_000n, p2pkhForPublicKey(shop.publicKey), 578n, feeWallet(sara, 901));
    const tx2 = finalizeSpend(s2, sara.hex, signVenn(s2, sara.privateKey), signFeeInputs(s2, sara.privateKey, sara.publicKey));
    expect(vmVerify(tx2, s2.sources)).toBe(true);
    expect(decodeCardState(tx2.outputs[0].token!.nft!.commitment)).toMatchObject({ left: 0n, last: T0 + 249_696n });
    expect(() =>
      buildBudgetSpend(w.params, w.coins, 1, T0 + 250_000n, p2pkhForPublicKey(shop.publicKey), 579n, feeWallet(sara, 902)),
    ).toThrow(/578/);
  });
});

describe('v2: the largest recovery transactions fit', () => {
  it('a 16-member Venn where everyone helps: a request and a vote to stop it are standard', () => {
    const many = Array.from({ length: 16 }, (_, i) => (i === 0 ? creator : key(200 + i)));
    const v = makeVault({
      members: many.map(k => member(k, VH)),
      settings: { stopRule: STOP.VOTERS, helpersNeeded: 15, waitUnits: 3, strongNeeded: 0, strongWaitUnits: 0 },
    });
    const req = buildRecoveryRequest(v.params, v.coins, pkhOf(creator), newPhone.hex, false, feeWallet(many[1]));
    const approvals = many.slice(1).map(k => ({ publicKey: k.hex, signature: signVenn(req.draft, k.privateKey) }));
    const tx = finalizeRecovery(req.draft, approvals, signFeeInputs(req.draft, many[1].privateKey, many[1].publicKey));
    expect(vmVerify(tx, req.draft.sources)).toBe(true);
    const pending = after(v, tx);
    const stop = buildRecoveryCancelByVote(pending.params, pending.coins, pkhOf(creator), feeWallet(many[2], 905));
    const votes = many.slice(1, 1 + stop.need).map(k => ({ publicKey: k.hex, signature: signVenn(stop.draft, k.privateKey) }));
    const stopTx = finalizeRecovery(stop.draft, votes, signFeeInputs(stop.draft, many[2].privateKey, many[2].publicKey));
    expect(vmVerify(stopTx, stop.draft.sources)).toBe(true);
  });
});

describe('v2: a key that holds two seats keeps working', () => {
  it('payment and removal votes assemble, with that key approving for each of its seats', () => {
    const three = [creator, sara, ali];
    const v = makeVault({ members: three.map(k => member(k, VH)), settings: { membership: 2, helpersNeeded: 2, strongNeeded: 2 } });
    // An earlier unanimous vote gave Sara a second seat (crafted: the app itself refuses to).
    const twin = vote(v, { add: [member(extra, VH)] }, three, t =>
      setCardHex(t, cardIndex(t, extra), hex => pkhOf(sara) + hex.slice(40)),
    );
    expect(vmVerify(twin.tx, twin.draft.sources)).toBe(true);
    const w = after(v, twin.tx);
    expect(w.coins.cards.filter(c => c.state.pkh === pkhOf(sara))).toHaveLength(2);
    expect(() => buildVote(w.params, w.coins, { add: [member(sara, VH)] }, feeWallet(creator))).toThrow(/only once/);

    const approve = (built: ReturnType<typeof buildVote>, signers: Key[]) =>
      finalizeVote(
        built.draft,
        signers.map(k => ({ publicKey: k.hex, signature: signVenn(built.draft, k.privateKey) })),
        signFeeInputs(built.draft, creator.privateKey, creator.publicKey),
      );
    const pay = buildVote(w.params, w.coins, { payments: [{ to: p2pkhForPublicKey(shop.publicKey), amount: 10_000n }] }, feeWallet(creator));
    expect(pay.need).toBe(3);
    expect(vmVerify(approve(pay, [creator, sara]), pay.draft.sources)).toBe(true);

    const removeBoth = buildVote(w.params, w.coins, { remove: [pkhOf(sara)] }, feeWallet(creator));
    expect(removeBoth.need).toBe(4);
    expect(vmVerify(approve(removeBoth, three), removeBoth.draft.sources)).toBe(true);
  });
});

describe('v2: required seats come first, not required keys', () => {
  it('a key with an ordinary and a required seat still lets every required seat sign', () => {
    // A (required), B (ordinary), C (required), and a vote gives B a second, required seat.
    const v = makeVault({
      members: [member(creator, VH | ROLE.REQUIRED), member(sara, VH), member(ali, VH | ROLE.REQUIRED)],
      settings: { membership: 1, helpersNeeded: 2, strongNeeded: 2 },
    });
    const twin = vote(v, { add: [member(extra, VH | ROLE.REQUIRED)] }, [creator, ali], t =>
      setCardHex(t, cardIndex(t, extra), hex => pkhOf(sara) + hex.slice(40)),
    );
    expect(vmVerify(twin.tx, twin.draft.sources)).toBe(true);
    const w = after(v, twin.tx);
    const pay = buildVote(w.params, w.coins, { payments: [{ to: p2pkhForPublicKey(shop.publicKey), amount: 10_000n }] }, feeWallet(creator));
    expect(pay.need).toBe(3);
    // Sara's approval is offered first; her ordinary seat must not crowd out a required one.
    const tx = finalizeVote(
      pay.draft,
      [sara, creator, ali].map(k => ({ publicKey: k.hex, signature: signVenn(pay.draft, k.privateKey) })),
      signFeeInputs(pay.draft, creator.privateKey, creator.publicKey),
    );
    expect(vmVerify(tx, pay.draft.sources)).toBe(true);
  });
});
