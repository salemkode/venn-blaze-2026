import { describe, expect, it } from 'vitest';
import { p2pkhForPublicKey } from '../../src/core/draft';
import { binToHex, concat } from '../../src/core/bytes';
import { hash160 } from '../../src/core/crypto';
import { type VoteChange, buildVote, finalizeVote, signFeeInputs, signVenn } from '../../src/venn/build';
import { finalizeVenn } from '../../src/venn/build';
import {
  BUDGET,
  type CardState,
  ROLE,
  type RulesState,
  decodeCardState,
  decodeRulesState,
  encodeCardState,
  encodeRulesState,
} from '../../src/venn/layout';
import { type Output, type Transaction, encodeTransaction } from '../../src/core/tx';
import { key, vmVerify } from '../helpers';
import { feeWallet, makeVault, member, people, withRawApprovals } from './fixtures';

const { creator, sara, ali, omar, lina, shop } = people;
const extra = key(30);
const five = [creator, sara, ali, omar, lina];
const VH = ROLE.VOTE | ROLE.HELPER;
const pkhOf = (k: { publicKey: Uint8Array }) => binToHex(hash160(k.publicKey));
const consensus = (tx: Transaction, sources: Output[]) => vmVerify(tx, sources, false);

const fiveVault = () =>
  makeVault({
    members: five.map((k, i) =>
      member(
        k,
        i === 1 ? ROLE.SPEND | VH : VH,
        i === 1 ? { budgetMode: BUDGET.REFILL, budget: 10_000n, period: 86_400n } : {},
      ),
    ),
    settings: {
      membership: 1,
      spending: 1,
      payments: 1,
      governance: 2,
      recoveryRule: 1,
      helpersNeeded: 2,
      strongNeeded: 3,
    },
  });

/** Builds a vote, has `signers` approve it, and returns the final transaction. */
const vote = (
  v: ReturnType<typeof fiveVault>,
  change: VoteChange,
  signers: ReturnType<typeof key>[],
  tweak?: (tx: Transaction, sources: Output[]) => void,
) => {
  const built = buildVote(v.params, v.coins, change, feeWallet(creator));
  tweak?.(built.draft.tx, built.draft.sources);
  const approvals = signers.map(k => ({ publicKey: k.hex, signature: signVenn(built.draft, k.privateKey) }));
  const base = signFeeInputs(built.draft, creator.privateKey, creator.publicKey);
  let tx: Transaction;
  try {
    tx = signers.length < built.need ? withRawApprovals(built.draft, signers, base) : finalizeVote(built.draft, approvals, base);
  } catch {
    // The app refuses to assemble an ineligible approval; craft the witness to test the contract.
    tx = withRawApprovals(built.draft, signers, base);
  }
  return { ...built, tx };
};

const setRules = (t: Transaction, f: (r: RulesState) => RulesState) => {
  t.outputs[0] = {
    ...t.outputs[0],
    token: {
      ...t.outputs[0].token!,
      nft: {
        capability: 'minting',
        commitment: encodeRulesState(f(decodeRulesState(t.outputs[0].token!.nft!.commitment))),
      },
    },
  };
};
const setRulesHex = (t: Transaction, f: (hex: string) => string) => {
  t.outputs[0] = {
    ...t.outputs[0],
    token: {
      ...t.outputs[0].token!,
      nft: { capability: 'minting', commitment: f(t.outputs[0].token!.nft!.commitment) },
    },
  };
};
const setCardAt = (t: Transaction, i: number, f: (c: CardState) => CardState) => {
  t.outputs[i] = {
    ...t.outputs[i],
    token: {
      ...t.outputs[i].token!,
      nft: {
        capability: 'mutable',
        commitment: encodeCardState(f(decodeCardState(t.outputs[i].token!.nft!.commitment))),
      },
    },
  };
};
const cardIndex = (t: Transaction, k: { publicKey: Uint8Array }) =>
  t.outputs.findIndex(o => o.token?.nft?.capability === 'mutable' && o.token.nft.commitment.startsWith(pkhOf(k)));

const rulesOut = (tx: Transaction) => decodeRulesState(tx.outputs[0].token!.nft!.commitment);
const addExtra: VoteChange = { add: [member(extra, VH)] };

describe('venn votes', () => {
  it('add a member with 3 of 5 passes', () => {
    const r = vote(fiveVault(), addExtra, [creator, sara, ali]);
    expect(r.need).toBe(3);
    expect(vmVerify(r.tx, r.draft.sources)).toBe(true);
    expect(rulesOut(r.tx).voters).toBe(6);
    expect(rulesOut(r.tx).helpers).toBe(6);
  });

  it('add a member with 2 of 5 fails', () => {
    const r = vote(fiveVault(), addExtra, [creator, sara]);
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
  });

  it('remove a member burns the card', () => {
    const r = vote(fiveVault(), { remove: [pkhOf(lina)] }, [creator, sara, ali]);
    expect(vmVerify(r.tx, r.draft.sources)).toBe(true);
    expect(rulesOut(r.tx).voters).toBe(4);
    const cards = r.tx.outputs.filter(o => o.token?.nft?.capability === 'mutable');
    expect(cards).toHaveLength(4);
  });

  it('governance change needs everyone', () => {
    const change: VoteChange = { settings: { membership: 2 } };
    const four = vote(fiveVault(), change, [creator, sara, ali, omar]);
    expect(consensus(four.tx, four.draft.sources)).not.toBe(true);
    const all = vote(fiveVault(), change, five);
    expect(all.need).toBe(5);
    expect(vmVerify(all.tx, all.draft.sources)).toBe(true);
  });

  it('payment above budgets passes with majority', () => {
    const recipient = p2pkhForPublicKey(shop.publicKey);
    const r = vote(fiveVault(), { payments: [{ to: recipient, amount: 200_000n }] }, [
      creator,
      sara,
      ali,
    ]);
    expect(vmVerify(r.tx, r.draft.sources)).toBe(true);
    expect(r.tx.outputs).toContainEqual({ value: 200_000n, lockingBytecode: recipient });
  });

  it('required member missing fails', () => {
    const v = makeVault({
      members: [member(creator, ROLE.VOTE | ROLE.REQUIRED), member(sara, VH), member(ali, VH), member(omar, VH)],
      settings: { helpersNeeded: 2, strongNeeded: 3 },
    });
    const without = vote(v, addExtra, [sara, ali, omar]);
    expect(consensus(without.tx, without.draft.sources)).not.toBe(true);
    const withOwner = vote(v, addExtra, [creator, sara, ali]);
    expect(withOwner.need).toBe(3);
    expect(vmVerify(withOwner.tx, withOwner.draft.sources)).toBe(true);
    const half = vote(v, addExtra, [creator, sara]);
    expect(consensus(half.tx, half.draft.sources)).not.toBe(true);
  });

  it('same card twice counts once', () => {
    const v = fiveVault();
    const built = buildVote(v.params, v.coins, addExtra, feeWallet(creator));
    const signers = [creator, sara, sara];
    const base = signFeeInputs(built.draft, creator.privateKey, creator.publicKey);
    const approvals = signers.map(k => ({ publicKey: k.hex, signature: signVenn(built.draft, k.privateKey) }));
    expect(() => finalizeVote(built.draft, approvals, base)).toThrow(/3 approvals are needed, 2 given/);
    expect(consensus(withRawApprovals(built.draft, signers, base), built.draft.sources)).not.toBe(true);
  });

  it('non-voter signature does not count', () => {
    const v = makeVault({
      members: [member(creator, VH), member(sara, VH), member(ali, VH), member(omar, ROLE.HELPER)],
      settings: { helpersNeeded: 2, strongNeeded: 3 },
    });
    expect(v.coins.rules.state.voters).toBe(3);
    // Omar's card is included (an unchanged update) so his signature can be offered.
    const r = vote(v, { ...addExtra, update: [{ pkh: pkhOf(omar) }] }, [creator, omar]);
    expect(r.need).toBe(2);
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
    const real = vote(v, { ...addExtra, update: [{ pkh: pkhOf(omar) }] }, [creator, sara]);
    expect(vmVerify(real.tx, real.draft.sources)).toBe(true);
  });

  it('locked category cannot change', () => {
    const v = makeVault({
      members: five.map(k => member(k, VH)),
      settings: { membership: 0, helpersNeeded: 2, strongNeeded: 3 },
    });
    expect(() => buildVote(v.params, v.coins, addExtra, feeWallet(creator))).toThrow(/locked/);
    // Crafted: the same vote, but the rules being spent say membership is locked.
    const r = vote(fiveVault(), addExtra, five, (t, sources) => {
      const lock = (hex: string) => encodeRulesState({ ...decodeRulesState(hex), membership: 0 });
      sources[0] = {
        ...sources[0],
        token: {
          ...sources[0].token!,
          nft: { capability: 'minting', commitment: lock(sources[0].token!.nft!.commitment) },
        },
      };
      t.outputs[0] = {
        ...t.outputs[0],
        token: {
          ...t.outputs[0].token!,
          nft: { capability: 'minting', commitment: lock(t.outputs[0].token!.nft!.commitment) },
        },
      };
    });
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
  });

  it('wrong recount fails', () => {
    const r = vote(fiveVault(), addExtra, five, t => {
      const rules = decodeRulesState(t.outputs[0].token!.nft!.commitment);
      t.outputs[0] = {
        ...t.outputs[0],
        token: {
          ...t.outputs[0].token!,
          nft: { capability: 'minting', commitment: encodeRulesState({ ...rules, voters: rules.voters - 1 }) },
        },
      };
    });
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
  });

  it('burn and re-add same address still needs membership rule', () => {
    const v = makeVault({
      members: five.map(k => member(k, VH)),
      settings: { membership: 2, helpersNeeded: 2, strongNeeded: 3 },
    });
    const change: VoteChange = { remove: [pkhOf(lina)], add: [member(lina, VH)] };
    const r = vote(v, change, [creator, sara, ali]);
    expect(r.need).toBe(5);
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
  });

  it('the largest vote, 16 voters all signing with a payment, fits a standard transaction', () => {
    const many = Array.from({ length: 16 }, (_, i) => (i === 0 ? creator : key(100 + i)));
    const v = makeVault({
      members: many.map(k => member(k, VH)),
      settings: { helpersNeeded: 2, strongNeeded: 3 },
      extraMoney: [40_000n, 40_000n, 40_000n, 40_000n],
    });
    const r = vote(
      v,
      { settings: { membership: 2 }, payments: [{ to: p2pkhForPublicKey(shop.publicKey), amount: 450_000n }] },
      many,
    );
    expect(r.need).toBe(16);
    expect(vmVerify(r.tx, r.draft.sources)).toBe(true);
    expect(encodeTransaction(r.tx).length).toBeLessThan(100_000);
  });

  it('a seventeenth voter is refused by the app and the contract', () => {
    const many = Array.from({ length: 16 }, (_, i) => (i === 0 ? creator : key(100 + i)));
    const v = makeVault({ members: many.map(k => member(k, VH)), settings: { helpersNeeded: 2, strongNeeded: 3 } });
    expect(() => buildVote(v.params, v.coins, addExtra, feeWallet(creator))).toThrow(/at most 16/);
    const r = vote(v, { add: [member(extra, ROLE.HELPER)] }, many.slice(0, 9), t => {
      setCardAt(t, cardIndex(t, extra), c => ({ ...c, roles: VH }));
      setRules(t, x => ({ ...x, voters: 17 }));
    });
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
  });

  it('governance locked cannot change', () => {
    const r = vote(fiveVault(), { settings: { membership: 2 } }, five, (t, sources) => {
      const lock = (hex: string) => encodeRulesState({ ...decodeRulesState(hex), governance: 0 });
      sources[0] = {
        ...sources[0],
        token: {
          ...sources[0].token!,
          nft: { capability: 'minting', commitment: lock(sources[0].token!.nft!.commitment) },
        },
      };
      setRules(t, x => ({ ...x, governance: 0 }));
    });
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
  });

  it('a stranger cannot sign for a member', () => {
    const v = fiveVault();
    const built = buildVote(v.params, v.coins, addExtra, feeWallet(creator));
    const entry = (k: ReturnType<typeof key>, index: number) => {
      const sig = signVenn(built.draft, k.privateKey);
      return concat(Uint8Array.of(index), k.publicKey, Uint8Array.of(sig.length), sig);
    };
    const indexOf = (k: ReturnType<typeof key>) =>
      built.draft.sources.findIndex(s => s.token?.nft?.commitment.startsWith(pkhOf(k)));
    const blob = concat(entry(creator, indexOf(creator)), entry(sara, indexOf(sara)), entry(extra, indexOf(ali)));
    const base = signFeeInputs(built.draft, creator.privateKey, creator.publicKey);
    const tx = finalizeVenn(built.draft, [blob, built.draft.venn!.lead[1]], base);
    expect(consensus(tx, built.draft.sources)).not.toBe(true);
  });

  it('a vote cannot touch a pending recovery', () => {
    const r = vote(fiveVault(), addExtra, [creator, sara, ali], t =>
      setCardAt(t, cardIndex(t, omar), c => ({ ...c, recovery: 1, newPkh: '44'.repeat(20), waitUnits: 1 })),
    );
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
  });

  it('a new card must start fresh', () => {
    const r = vote(fiveVault(), addExtra, [creator, sara, ali], t =>
      setCardAt(t, cardIndex(t, extra), c => ({ ...c, recovery: 2, newPkh: '44'.repeat(20), waitUnits: 1 })),
    );
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
  });

  it('a vote that changes nothing fails', () => {
    const v = fiveVault();
    expect(() => buildVote(v.params, v.coins, {}, feeWallet(creator))).toThrow(/nothing/);
    const r = vote(v, addExtra, [creator, sara, ali], t => {
      const i = cardIndex(t, extra);
      const freed = t.outputs[i].value;
      t.outputs.splice(i, 1);
      t.outputs[t.outputs.length - 1].value += freed;
      setRules(t, x => ({ ...x, voters: 5, helpers: 5 }));
    });
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
  });

  it('reserved rules bytes stay zero', () => {
    const r = vote(fiveVault(), addExtra, [creator, sara, ali], t => setRulesHex(t, hex => hex.slice(0, 106) + '01'));
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
  });

  it('a vote cannot quietly refill a budget', () => {
    const r = vote(fiveVault(), addExtra, [creator, sara, ali], t =>
      setCardAt(t, cardIndex(t, sara), c => ({ ...c, left: c.left + 1n })),
    );
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
  });

  it('helper and required counts must match the cards', () => {
    const helpers = vote(fiveVault(), addExtra, [creator, sara, ali], t =>
      setRules(t, x => ({ ...x, helpers: x.helpers - 1 })),
    );
    expect(consensus(helpers.tx, helpers.draft.sources)).not.toBe(true);
    const required = vote(fiveVault(), addExtra, [creator, sara, ali], t => setRules(t, x => ({ ...x, required: 1 })));
    expect(consensus(required.tx, required.draft.sources)).not.toBe(true);
  });

  const lockedSource = (field: keyof RulesState, value: number) => (t: Transaction, sources: Output[]) => {
    const lock = (hex: string) => encodeRulesState({ ...decodeRulesState(hex), [field]: value });
    sources[0] = {
      ...sources[0],
      token: {
        ...sources[0].token!,
        nft: { capability: 'minting', commitment: lock(sources[0].token!.nft!.commitment) },
      },
    };
    setRules(t, x => ({ ...x, [field]: value }));
  };

  it('spending, recovery and payments rules are honoured when locked', () => {
    const spend = vote(
      fiveVault(),
      { update: [{ pkh: pkhOf(sara), budget: 20_000n }] },
      five,
      lockedSource('spending', 0),
    );
    expect(consensus(spend.tx, spend.draft.sources)).not.toBe(true);
    const recovery = vote(fiveVault(), addExtra, five, lockedSource('recoveryRule', 0));
    expect(consensus(recovery.tx, recovery.draft.sources)).not.toBe(true);
    // Payments can never be locked; a rules NFT claiming so must not let a payment through.
    const pay = vote(
      fiveVault(),
      { payments: [{ to: p2pkhForPublicKey(shop.publicKey), amount: 1_000n }] },
      five,
      (t, sources) => {
        const lock = (hex: string) => hex.slice(0, 16) + '00' + hex.slice(18);
        sources[0] = {
          ...sources[0],
          token: {
            ...sources[0].token!,
            nft: { capability: 'minting', commitment: lock(sources[0].token!.nft!.commitment) },
          },
        };
      },
    );
    expect(consensus(pay.tx, pay.draft.sources)).not.toBe(true);
  });

  it('plan has exactly one byte per input', () => {
    const v = fiveVault();
    const built = buildVote(v.params, v.coins, addExtra, feeWallet(creator));
    const approvals = [creator, sara, ali].map(k => ({
      publicKey: k.hex,
      signature: signVenn(built.draft, k.privateKey),
    }));
    built.draft.venn!.lead[1] = concat(built.draft.venn!.lead[1], Uint8Array.of(0));
    const tx = finalizeVote(built.draft, approvals, signFeeInputs(built.draft, creator.privateKey, creator.publicKey));
    expect(consensus(tx, built.draft.sources)).not.toBe(true);
  });

  it('a kept card needs a real role', () => {
    const r = vote(fiveVault(), addExtra, [creator, sara, ali], t => {
      setCardAt(t, cardIndex(t, omar), c => ({ ...c, roles: 0 }));
      setRules(t, x => ({ ...x, voters: x.voters - 1, helpers: x.helpers - 1 }));
    });
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
  });

  it('budgets start full when added or changed, and keep their clock', () => {
    const fresh = vote(
      fiveVault(),
      { add: [member(extra, ROLE.SPEND | VH, { budgetMode: BUDGET.REFILL, budget: 5_000n, period: 86_400n })] },
      [creator, sara, ali],
      t => setCardAt(t, cardIndex(t, extra), c => ({ ...c, left: 1n })),
    );
    expect(consensus(fresh.tx, fresh.draft.sources)).not.toBe(true);
    const change = { update: [{ pkh: pkhOf(sara), budget: 20_000n }] };
    const accepted = vote(fiveVault(), change, [creator, ali, omar]);
    expect(vmVerify(accepted.tx, accepted.draft.sources)).toBe(true);
    const card = accepted.tx.outputs[cardIndex(accepted.tx, sara)];
    expect(decodeCardState(card.token!.nft!.commitment)).toMatchObject({ budget: 20_000n, left: 20_000n });
    const left = vote(fiveVault(), change, [creator, ali, omar], t =>
      setCardAt(t, cardIndex(t, sara), c => ({ ...c, left: 1n })),
    );
    expect(consensus(left.tx, left.draft.sources)).not.toBe(true);
    const clock = vote(fiveVault(), change, [creator, ali, omar], t =>
      setCardAt(t, cardIndex(t, sara), c => ({ ...c, last: 5n })),
    );
    expect(consensus(clock.tx, clock.draft.sources)).not.toBe(true);
  });

  it('a vote cannot leave the vault without voters', () => {
    const r = vote(fiveVault(), addExtra, five, t => {
      for (const k of [...five, extra]) setCardAt(t, cardIndex(t, k), c => ({ ...c, roles: c.roles & ~ROLE.VOTE }));
      setRules(t, x => ({ ...x, voters: 0 }));
    });
    expect(consensus(r.tx, r.draft.sources)).not.toBe(true);
  });

  it('reserved delay bytes and the stop rule stay valid', () => {
    const delay = vote(fiveVault(), addExtra, [creator, sara, ali], t =>
      setRulesHex(t, hex => hex.slice(0, 18) + '01' + hex.slice(20)),
    );
    expect(consensus(delay.tx, delay.draft.sources)).not.toBe(true);
    const stop = vote(fiveVault(), addExtra, [creator, sara, ali], t =>
      setRulesHex(t, hex => hex.slice(0, 32) + '00' + hex.slice(34)),
    );
    expect(consensus(stop.tx, stop.draft.sources)).not.toBe(true);
  });
});
