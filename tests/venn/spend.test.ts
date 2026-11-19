import { describe, expect, it } from 'vitest';
import { p2pkhForPublicKey } from '../../src/core/draft';
import { binToHex } from '../../src/core/bytes';
import { hash160 } from '../../src/core/crypto';
import { buildBudgetSpend, finalizeSpend, signFeeInputs, signVenn } from '../../src/venn/build';
import { vennCoins } from '../../src/venn/coins';
import { moneyLocking, vennLocking } from '../../src/venn/contract';
import { BUDGET, type CardState, ROLE, decodeCardState, encodeCardState } from '../../src/venn/layout';
import type { Output, Transaction } from '../../src/core/tx';
import { utxoFrom, vmVerify } from '../helpers';
import { feeWallet, makeVault, member, people } from './fixtures';

const { creator, sara, ali, shop } = people;
const T0 = 1_800_000_000n;
const DAY = 86_400n;
const to = p2pkhForPublicKey(shop.publicKey);

const spender = (over: Parameters<typeof member>[2] = {}) =>
  member(sara, ROLE.SPEND | ROLE.VOTE | ROLE.HELPER, {
    budgetMode: BUDGET.REFILL,
    budget: 50_000n,
    period: DAY,
    ...over,
  });
const vault = (over: Parameters<typeof member>[2] = {}, asset?: string) =>
  makeVault({
    members: [member(creator, ROLE.VOTE | ROLE.HELPER), spender(over), member(ali, ROLE.VOTE | ROLE.HELPER)],
    asset,
  });

/** Builds, signs and finalises a spend by Sara; returns the transaction and its sources. */
const spend = (
  v: ReturnType<typeof vault>,
  now: bigint,
  amount: bigint,
  tweak?: (tx: Transaction, sources: Output[]) => void,
) => {
  const index = v.coins.cards.findIndex(c => c.state.pkh === binToHex(hash160(sara.publicKey)));
  const draft = buildBudgetSpend(v.params, v.coins, index, now, to, amount, feeWallet(sara));
  tweak?.(draft.tx, draft.sources);
  const base = signFeeInputs(draft, sara.privateKey, sara.publicKey);
  const tx = finalizeSpend(draft, sara.hex, signVenn(draft, sara.privateKey), base);
  return { tx, draft };
};

/** The vault's coins after a transaction. */
const after = (v: ReturnType<typeof vault>, tx: Transaction) => {
  const locks = [binToHex(vennLocking(v.params)), binToHex(moneyLocking(v.params))];
  const kept = v.utxos.filter(u => !tx.inputs.some(i => i.txid === u.txid && i.vout === u.vout));
  const fresh = tx.outputs
    .map((o, i) => [o, i] as const)
    .filter(([o]) => locks.includes(binToHex(o.lockingBytecode)))
    .map(([, i]) => utxoFrom(tx, i, 200));
  const utxos = [...kept, ...fresh];
  return { ...v, utxos, coins: vennCoins(v.params, utxos)! };
};

/** Crafted transactions are judged by consensus rules only, as a miner could include them. */
const consensus = (tx: Transaction, sources: Output[]) => vmVerify(tx, sources, false);

/** Card commitment with `left` written exactly as the contract would (script number, 8 bytes). */
const rawLeft = (card: CardState, left: bigint): string => {
  const hex = encodeCardState({ ...card, left: 0n });
  const abs = left < 0n ? -left : left;
  const bytes = Array.from({ length: 8 }, (_, i) => Number((abs >> BigInt(8 * i)) & 0xffn));
  if (left < 0n) bytes[7] |= 0x80;
  return hex.slice(0, 92) + bytes.map(b => b.toString(16).padStart(2, '0')).join('') + hex.slice(108);
};

/** Takes `n` more satoshis out of the vault's change into the payment, keeping the card consistent. */
const overpay = (v: ReturnType<typeof vault>, n: bigint) => (t: Transaction) => {
  const change = t.outputs.findIndex(
    (o, i) => i > 1 && binToHex(o.lockingBytecode) === binToHex(moneyLocking(v.params)),
  );
  t.outputs[change].value -= n;
  t.outputs[1].value += n;
  const card = decodeCardState(t.outputs[0].token!.nft!.commitment);
  t.outputs[0] = {
    ...t.outputs[0],
    token: { ...t.outputs[0].token!, nft: { capability: 'mutable', commitment: rawLeft(card, card.left - n) } },
  };
};

const setCard = (tx: Transaction, card: CardState) => {
  tx.outputs[0] = {
    ...tx.outputs[0],
    token: { ...tx.outputs[0].token!, nft: { capability: 'mutable', commitment: encodeCardState(card) } },
  };
};

describe('venn budget spend', () => {
  it('member spends within budget', () => {
    const v = vault();
    const { tx, draft } = spend(v, T0, 20_000n);
    expect(vmVerify(tx, draft.sources)).toBe(true);
    expect(decodeCardState(tx.outputs[0].token!.nft!.commitment).left).toBe(30_000n);
    expect(tx.outputs[1]).toEqual({ value: 20_000n, lockingBytecode: to });
  });

  it('over budget fails', () => {
    const v = vault();
    expect(() => spend(v, T0, 50_001n)).toThrow(/budget/);
    const { tx, draft } = spend(v, T0, 50_000n, overpay(v, 1n));
    expect(consensus(tx, draft.sources)).not.toBe(true);
  });

  it('over per-payment cap fails', () => {
    const v = vault({ cap: 10_000n });
    expect(() => spend(v, T0, 10_001n)).toThrow(/single payment/);
    const { tx, draft } = spend(v, T0, 10_000n, overpay(v, 1n));
    expect(consensus(tx, draft.sources)).not.toBe(true);
  });

  it('earlier time than last fails', () => {
    const v = vault();
    const first = spend(v, T0, 10_000n);
    const v2 = after(v, first.tx);
    const card = v2.coins.cards.find(c => c.state.pkh === binToHex(hash160(sara.publicKey)))!.state;
    expect(() => spend(v2, T0 - 10n, 1_000n)).toThrow(/earlier/);
    const { tx, draft } = spend(v2, T0, 1_000n, t => {
      t.locktime = Number(T0 - 10n);
      const left = card.left + (card.budget * -10n) / card.period - 1_000n;
      setCard(t, { ...card, left, last: T0 - 10n });
    });
    expect(consensus(tx, draft.sources)).not.toBe(true);
  });

  it('budget refills over time up to one full period', () => {
    const v = vault();
    const a = spend(v, T0, 50_000n);
    expect(vmVerify(a.tx, a.draft.sources)).toBe(true);
    const v2 = after(v, a.tx);
    const b = spend(v2, T0 + DAY / 2n, 25_000n);
    expect(vmVerify(b.tx, b.draft.sources)).toBe(true);
    const used = after(v2, b.tx);
    expect(() => spend(used, T0 + DAY / 2n, 1n)).toThrow(/budget/);
    const later = T0 + 10n * DAY;
    expect(() => spend(used, later, 50_001n)).toThrow(/budget/);
    const refilled = spend(used, later, 50_000n);
    expect(vmVerify(refilled.tx, refilled.draft.sources)).toBe(true);
  });

  it('fixed mode preserves the period during a spend and carries unused periods over', () => {
    let v = vault({ budgetMode: BUDGET.FIXED });
    const first = spend(v, T0, 20_000n);
    v = after(v, first.tx);
    expect(() => spend(v, T0 + 100n, 30_001n)).toThrow(/budget/);
    const rest = spend(v, T0 + 100n, 30_000n);
    expect(vmVerify(rest.tx, rest.draft.sources)).toBe(true);
    v = after(v, rest.tx);
    // Three idle periods later, the member backdates each spend to collect every missed period.
    for (let k = 1n; k <= 4n; k++) {
      const s = spend(v, T0 + k * DAY, 50_000n);
      expect(vmVerify(s.tx, s.draft.sources)).toBe(true);
      v = after(v, s.tx);
    }
  });

  it('recovery-pending card cannot spend', () => {
    const v = vault();
    const card = v.coins.cards[1];
    v.coins.cards[1] = { ...card, state: { ...card.state, recovery: 1, newPkh: '33'.repeat(20), waitUnits: 1 } };
    expect(() => spend(v, T0, 1_000n)).toThrow(/recovery/);
    // Crafted by hand: the same spend from a card whose recovery is pending.
    const ok = vault();
    const { tx, draft } = spend(ok, T0, 1_000n, (t, sources) => {
      const pending = (c: CardState): CardState => ({ ...c, recovery: 1, newPkh: '33'.repeat(20), waitUnits: 1 });
      const src = decodeCardState(sources[0].token!.nft!.commitment);
      sources[0] = {
        ...sources[0],
        token: { ...sources[0].token!, nft: { capability: 'mutable', commitment: encodeCardState(pending(src)) } },
      };
      setCard(t, pending(decodeCardState(t.outputs[0].token!.nft!.commitment)));
    });
    expect(consensus(tx, draft.sources)).not.toBe(true);
  });

  it('card without SPEND cannot spend', () => {
    const v = makeVault({
      members: [
        member(creator, ROLE.VOTE),
        member(sara, ROLE.VOTE | ROLE.HELPER),
        member(ali, ROLE.VOTE | ROLE.HELPER),
      ],
    });
    expect(() => spend(v, T0, 1_000n)).toThrow(/spend alone/);
    // Crafted by hand: a budget card whose SPEND role was never given.
    const ok = vault();
    const { tx, draft } = spend(ok, T0, 1_000n, (t, sources) => {
      const src = decodeCardState(sources[0].token!.nft!.commitment);
      sources[0] = {
        ...sources[0],
        token: {
          ...sources[0].token!,
          nft: { capability: 'mutable', commitment: encodeCardState({ ...src, roles: ROLE.VOTE }) },
        },
      };
      setCard(t, { ...decodeCardState(t.outputs[0].token!.nft!.commitment), roles: ROLE.VOTE });
    });
    expect(consensus(tx, draft.sources)).not.toBe(true);
  });

  it('token vault: member spends tokens within budget', () => {
    const asset = 'cd'.repeat(32);
    const v = vault({ budget: 5_000n }, asset);
    const { tx, draft } = spend(v, T0, 3_000n);
    expect(vmVerify(tx, draft.sources)).toBe(true);
    expect(tx.outputs[1].token).toEqual({ category: asset, amount: 3_000n });
  });

  it('token vault: BCH dust cannot leave', () => {
    const asset = 'cd'.repeat(32);
    const v = vault({ budget: 5_000n }, asset);
    const { tx, draft } = spend(v, T0, 3_000n, t => {
      const change = t.outputs.findIndex(
        o => o.token?.category === asset && binToHex(o.lockingBytecode) === binToHex(moneyLocking(v.params)),
      );
      t.outputs[change].value -= 500n;
      t.outputs[t.outputs.length - 1].value += 500n;
    });
    expect(consensus(tx, draft.sources)).not.toBe(true);
  });

  it('token vault: foreign token deposit is untouched', () => {
    const asset = 'cd'.repeat(32);
    const v = vault({ budget: 5_000n }, asset);
    const locking = moneyLocking(v.params);
    const foreign = {
      txid: 'ef'.repeat(32),
      vout: 0,
      value: 1_000n,
      height: 100,
      lockingBytecode: locking,
      token: { category: 'ee'.repeat(32), amount: 9n },
    };
    const { tx, draft } = spend(v, T0, 3_000n, (t, sources) => {
      t.inputs.splice(1, 0, { txid: foreign.txid, vout: 0, sequence: 0xffffffff, unlockingBytecode: new Uint8Array() });
      sources.splice(1, 0, { value: foreign.value, lockingBytecode: locking, token: foreign.token });
      t.outputs[t.outputs.length - 1] = {
        ...t.outputs[t.outputs.length - 1],
        token: { category: 'ee'.repeat(32), amount: 9n },
      };
      // Return the foreign coin's BCH to the vault so only the token check can catch this.
      const change = t.outputs.findIndex(
        o => o.token?.category === asset && binToHex(o.lockingBytecode) === binToHex(locking),
      );
      t.outputs[change].value += 1_000n;
      t.outputs[t.outputs.length - 1].value -= 1_000n;
      // Keep the card consistent with the foreign tokens being counted as spent.
      const card = decodeCardState(t.outputs[0].token!.nft!.commitment);
      setCard(t, { ...card, left: card.left - 9n });
    });
    expect(consensus(tx, draft.sources)).not.toBe(true);
  });

  it('the time claim must be enforced by the network', () => {
    // All inputs final: the network would ignore the locktime, so any time could be claimed.
    const v = vault();
    const { tx, draft } = spend(v, T0, 1_000n, t => t.inputs.forEach(i => (i.sequence = 0xffffffff)));
    expect(consensus(tx, draft.sources)).not.toBe(true);
  });

  it('the time claim must be a time, not a block height', () => {
    const v = vault();
    const { tx, draft } = spend(v, 499_999_999n, 1_000n);
    expect(consensus(tx, draft.sources)).not.toBe(true);
  });

  it('the card keeps its BCH', () => {
    const v = vault();
    const { tx, draft } = spend(v, T0, 1_000n, t => {
      t.outputs[0].value -= 100n;
      t.outputs[t.outputs.length - 1].value += 100n;
    });
    expect(consensus(tx, draft.sources)).not.toBe(true);
  });

  it('a fixed budget needs a real period', () => {
    const v = vault({ budgetMode: BUDGET.FIXED });
    const { tx, draft } = spend(v, T0, 1_000n, (t, sources) => {
      const zero = (c: CardState): CardState => ({ ...c, period: 0n });
      sources[0] = {
        ...sources[0],
        token: {
          ...sources[0].token!,
          nft: {
            capability: 'mutable',
            commitment: encodeCardState(zero(decodeCardState(sources[0].token!.nft!.commitment))),
          },
        },
      };
      setCard(t, zero(decodeCardState(t.outputs[0].token!.nft!.commitment)));
    });
    expect(consensus(tx, draft.sources)).not.toBe(true);
  });

  it('a spend must pay something', () => {
    const v = vault();
    const { tx, draft } = spend(v, T0, 1_000n, t => {
      const change = t.outputs.findIndex(
        (o, i) => i > 1 && binToHex(o.lockingBytecode) === binToHex(moneyLocking(v.params)),
      );
      t.outputs[change].value += t.outputs[1].value;
      t.outputs.splice(1, 1);
      const card = decodeCardState(t.outputs[0].token!.nft!.commitment);
      setCard(t, { ...card, left: card.left + 1_000n });
    });
    expect(consensus(tx, draft.sources)).not.toBe(true);
  });
});
