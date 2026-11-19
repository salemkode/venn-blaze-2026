import { describe, expect, it } from 'vitest';
import { WaitForTime, p2pkhForPublicKey , timeLockSequence } from '../../src/core/draft';
import { binToHex, concat } from '../../src/core/bytes';
import { hash160 } from '../../src/core/crypto';
import {
  buildRecoveryCancelByKey,
  buildRecoveryCancelByVote,
  buildRecoveryComplete,
  buildRecoveryRequest,
  buildVote,
  finalizeRecovery,
  signFeeInputs,
  signVenn,
  finalizeVenn,
} from '../../src/venn/build';
import { vennCoins } from '../../src/venn/coins';
import { vennLocking } from '../../src/venn/contract';
import { BUDGET, type CardState, ROLE, STOP, decodeCardState, encodeCardState } from '../../src/venn/layout';
import type { Draft } from '../../src/core/draft';
import type { Output, Transaction } from '../../src/core/tx';
import { key, utxoFrom, vmVerify } from '../helpers';
import { feeWallet, makeVault, member, people, withRawApprovals } from './fixtures';

const { creator, sara, ali, omar, newPhone } = people;
const VH = ROLE.VOTE | ROLE.HELPER;
const pkhOf = (k: { publicKey: Uint8Array }) => binToHex(hash160(k.publicKey));
const consensus = (tx: Transaction, sources: Output[]) => vmVerify(tx, sources, false);
type Key = ReturnType<typeof key>;

/** Creator spends and votes; Sara, Ali and Omar vote and help. Stop rule and waits are configurable. */
const vault = (stopRule: 1 | 2 | 3 = STOP.BOTH, recoveryOn = true) =>
  makeVault({
    members: [
      member(creator, ROLE.SPEND | ROLE.VOTE, { budgetMode: BUDGET.REFILL, budget: 10_000n, period: 86_400n }),
      member(sara, VH),
      member(ali, VH),
      member(omar, VH),
    ],
    settings: recoveryOn
      ? {
          stopRule,
          helpersNeeded: 2,
          waitUnits: 3,
          strongNeeded: stopRule === STOP.BOTH ? 3 : 0,
          strongWaitUnits: stopRule === STOP.BOTH ? 6 : 0,
        }
      : { recoveryOn: false, helpersNeeded: 0, waitUnits: 0, strongNeeded: 0, strongWaitUnits: 0 },
  });
type V = ReturnType<typeof vault>;

const after = (v: V, tx: Transaction): V => {
  const locking = vennLocking(v.params);
  const kept = v.utxos.filter(u => !tx.inputs.some(i => i.txid === u.txid && i.vout === u.vout));
  const fresh = tx.outputs
    .map((o, i) => [o, i] as const)
    .filter(([o]) => binToHex(o.lockingBytecode) === binToHex(locking))
    .map(([, i]) => utxoFrom(tx, i, 200));
  const utxos = [...kept, ...fresh];
  return { ...v, utxos, coins: vennCoins(v.params, utxos)! };
};

const signAll = (draft: Draft, signers: Key[], payer: Key, tweak?: (t: Transaction, s: Output[]) => void) => {
  tweak?.(draft.tx, draft.sources);
  const approvals = signers.map(k => ({ publicKey: k.hex, signature: signVenn(draft, k.privateKey) }));
  const base = signFeeInputs(draft, payer.privateKey, payer.publicKey);
  try {
    return finalizeRecovery(draft, approvals, base);
  } catch {
    // The app refuses to assemble an ineligible approval; craft the witness to test the contract.
    return withRawApprovals(draft, signers, base);
  }
};

const request = (v: V, helpers: Key[], strong = false, tweak?: (t: Transaction, s: Output[]) => void) => {
  const built = buildRecoveryRequest(v.params, v.coins, pkhOf(creator), newPhone.hex, strong, feeWallet(sara));
  tweak?.(built.draft.tx, built.draft.sources);
  const tx = helpers.length < built.need
    ? withRawApprovals(built.draft, helpers, signFeeInputs(built.draft, sara.privateKey, sara.publicKey))
    : signAll(built.draft, helpers, sara);
  return { ...built, tx };
};

const cardOf = (v: V, k: { publicKey: Uint8Array }): CardState =>
  v.coins.cards.find(c => c.state.pkh === pkhOf(k))!.state;

const complete = (v: V, elapsed: number, tweak?: (t: Transaction, s: Output[]) => void) => {
  const draft = buildRecoveryComplete(v.params, v.coins, pkhOf(creator), elapsed, feeWallet(newPhone));
  tweak?.(draft.tx, draft.sources);
  const tx = finalizeRecovery(
    draft,
    { publicKey: newPhone.hex, signature: signVenn(draft, newPhone.privateKey) },
    signFeeInputs(draft, newPhone.privateKey, newPhone.publicKey),
  );
  return { draft, tx };
};

describe('venn recovery', () => {
  it('request with enough helpers sets pending; with one helper fails', () => {
    const v = vault();
    const r = request(v, [sara, ali]);
    expect(r.need).toBe(2);
    expect(vmVerify(r.tx, r.draft.sources)).toBe(true);
    const card = cardOf(after(v, r.tx), creator);
    expect([card.recovery, card.newPkh, card.waitUnits]).toEqual([1, pkhOf(newPhone), 3]);
    const one = request(v, [sara]);
    expect(consensus(one.tx, one.draft.sources)).not.toBe(true);
  });

  it('target cannot approve own recovery', () => {
    const v = makeVault({
      members: [member(creator, VH), member(sara, VH), member(ali, VH)],
      settings: { stopRule: STOP.KEY, helpersNeeded: 2, waitUnits: 3, strongNeeded: 0, strongWaitUnits: 0 },
    });
    const built = buildRecoveryRequest(v.params, v.coins, pkhOf(creator), newPhone.hex, false, feeWallet(sara));
    // The target's own card is an input; its owner "approving" must not count.
    const tx = signAll(built.draft, [creator, sara], sara);
    expect(consensus(tx, built.draft.sources)).not.toBe(true);
  });

  it('complete before the wait fails, after the wait passes', () => {
    const v = vault();
    const pending = after(v, request(v, [sara, ali]).tx);
    expect(() =>
      buildRecoveryComplete(pending.params, pending.coins, pkhOf(creator), 3 * 512 - 1, feeWallet(newPhone)),
    ).toThrow(WaitForTime);
    const early = complete(pending, 3 * 512, t => (t.inputs[0].sequence = timeLockSequence(2)));
    expect(consensus(early.tx, early.draft.sources)).not.toBe(true);
    const done = complete(pending, 3 * 512);
    expect(vmVerify(done.tx, done.draft.sources)).toBe(true);
    const card = decodeCardState(done.tx.outputs[0].token!.nft!.commitment);
    expect([card.pkh, card.recovery, card.newPkh, card.waitUnits]).toEqual([pkhOf(newPhone), 0, '00'.repeat(20), 0]);
    expect(card.budget).toBe(10_000n);
  });

  it('only the new key can complete', () => {
    const v = vault();
    const pending = after(v, request(v, [sara, ali]).tx);
    const draft = buildRecoveryComplete(pending.params, pending.coins, pkhOf(creator), 3 * 512, feeWallet(newPhone));
    const tx = finalizeRecovery(
      draft,
      { publicKey: omar.hex, signature: signVenn(draft, omar.privateKey) },
      signFeeInputs(draft, newPhone.privateKey, newPhone.publicKey),
    );
    expect(consensus(tx, draft.sources)).not.toBe(true);
  });

  it('stop rule A: key cancels', () => {
    const v = vault(STOP.KEY);
    const pending = after(v, request(v, [sara, ali]).tx);
    const draft = buildRecoveryCancelByKey(pending.params, pending.coins, pkhOf(creator), feeWallet(creator));
    const tx = finalizeRecovery(
      draft,
      { publicKey: creator.hex, signature: signVenn(draft, creator.privateKey) },
      signFeeInputs(draft, creator.privateKey, creator.publicKey),
    );
    expect(vmVerify(tx, draft.sources)).toBe(true);
    expect(decodeCardState(tx.outputs[0].token!.nft!.commitment).recovery).toBe(0);
    expect(() => buildRecoveryCancelByVote(pending.params, pending.coins, pkhOf(creator), feeWallet(sara))).toThrow(
      /stop rule|cannot/i,
    );
  });

  it('stop rule B: key cannot cancel, voters majority can', () => {
    const v = vault(STOP.VOTERS);
    const pending = after(v, request(v, [sara, ali]).tx);
    expect(cardOf(pending, creator).recovery).toBe(2);
    expect(() => buildRecoveryCancelByKey(pending.params, pending.coins, pkhOf(creator), feeWallet(creator))).toThrow(
      /cannot/,
    );
    // Crafted key cancel of a "may not cancel" request.
    const card = pending.coins.cards.find(c => c.state.pkh === pkhOf(creator))!;
    const forged = {
      ...pending,
      coins: {
        ...pending.coins,
        cards: pending.coins.cards.map(c => (c === card ? { ...c, state: { ...c.state, recovery: 1 as const } } : c)),
      },
    };
    const draft = buildRecoveryCancelByKey(forged.params, forged.coins, pkhOf(creator), feeWallet(creator));
    draft.sources[0] = { ...draft.sources[0], token: card.token };
    const tx = finalizeRecovery(
      draft,
      { publicKey: creator.hex, signature: signVenn(draft, creator.privateKey) },
      signFeeInputs(draft, creator.privateKey, creator.publicKey),
    );
    expect(consensus(tx, draft.sources)).not.toBe(true);

    const built = buildRecoveryCancelByVote(pending.params, pending.coins, pkhOf(creator), feeWallet(sara));
    expect(built.need).toBe(3);
    const two = withRawApprovals(built.draft, [sara, ali], signFeeInputs(built.draft, sara.privateKey, sara.publicKey));
    expect(consensus(two, built.draft.sources)).not.toBe(true);
    const three = signAll(built.draft, [sara, ali, omar], sara);
    expect(vmVerify(three, built.draft.sources)).toBe(true);
    expect(cardOf(after(pending, three), creator).recovery).toBe(0);
  });

  it('stop rule C: normal path key-cancellable, strong path not', () => {
    const v = vault(STOP.BOTH);
    const weak = request(v, [sara, ali], true);
    expect(weak.need).toBe(3);
    expect(consensus(weak.tx, weak.draft.sources)).not.toBe(true);
    const strong = request(v, [sara, ali, omar], true);
    expect(vmVerify(strong.tx, strong.draft.sources)).toBe(true);
    const pending = after(v, strong.tx);
    expect([cardOf(pending, creator).recovery, cardOf(pending, creator).waitUnits]).toEqual([2, 6]);
    expect(() => buildRecoveryCancelByKey(pending.params, pending.coins, pkhOf(creator), feeWallet(creator))).toThrow(
      /cannot/,
    );
    expect(() =>
      buildRecoveryComplete(pending.params, pending.coins, pkhOf(creator), 3 * 512, feeWallet(newPhone)),
    ).toThrow(WaitForTime);
  });

  it('strong path only exists under stop rule C', () => {
    const v = vault(STOP.KEY);
    expect(() => buildRecoveryRequest(v.params, v.coins, pkhOf(creator), newPhone.hex, true, feeWallet(sara))).toThrow(
      /strong/,
    );
    const invalid = request(vault(), [sara, ali, omar], true, rulesBoth(h => byte(h, 16, '01')));
    expect(consensus(invalid.tx, invalid.draft.sources)).not.toBe(true);
  });

  it('recovery off: request fails', () => {
    const v = vault(STOP.KEY, false);
    expect(() => buildRecoveryRequest(v.params, v.coins, pkhOf(creator), newPhone.hex, false, feeWallet(sara))).toThrow(
      /off/,
    );
  });

  it('a vote can remove a card with a pending recovery', () => {
    const v = vault();
    const pending = after(v, request(v, [sara, ali]).tx);
    const built = buildVote(pending.params, pending.coins, { remove: [pkhOf(creator)] }, feeWallet(sara));
    const tx = signAll(built.draft, [sara, ali, omar], sara);
    expect(vmVerify(tx, built.draft.sources)).toBe(true);
    expect(after(pending, tx).coins.cards.map(card => card.state.pkh)).not.toContain(pkhOf(creator));
  });

  // Crafted transactions below: each breaks exactly one rule while staying otherwise valid.
  type Coin = { token?: { nft?: { commitment: string } } };
  const withCommitment = <T extends Coin>(o: T, f: (hex: string) => string): T =>
    ({ ...o, token: { ...o.token!, nft: { ...o.token!.nft!, commitment: f(o.token!.nft!.commitment) } } } as T);
  const byte = (hex: string, offset: number, value: string) =>
    hex.slice(0, offset * 2) + value + hex.slice(offset * 2 + value.length);
  /** Applies `f` to the rules both as spent (input 0) and as continued (output 0). */
  const rulesBoth = (f: (hex: string) => string) => (t: Transaction, src: Output[]) => {
    src[0] = withCommitment(src[0], f);
    t.outputs[0] = withCommitment(t.outputs[0], f);
  };
  const cardIdx = (src: Output[], k: { publicKey: Uint8Array }) =>
    src.findIndex(o => o.token?.nft?.capability === 'mutable' && o.token.nft.commitment.startsWith(pkhOf(k)));
  /** Applies `f` to a card both as spent and as continued at the same index. */
  const cardBoth = (k: { publicKey: Uint8Array }, f: (hex: string) => string) => (t: Transaction, src: Output[]) => {
    const i = cardIdx(src, k);
    src[i] = withCommitment(src[i], f);
    t.outputs[i] = withCommitment(t.outputs[i], f);
  };
  const crafted = (v: V, helpers: Key[], tweak: (t: Transaction, s: Output[]) => void) => {
    const { tx, draft } = request(v, helpers, false, tweak);
    return consensus(tx, draft.sources);
  };

  it('crafted requests break', () => {
    // Recovery switched off in the rules being spent.
    expect(
      crafted(
        vault(),
        [sara, ali],
        rulesBoth(h => byte(h, 12, '00')),
      ),
    ).not.toBe(true);
    // The rules change during a request.
    expect(
      crafted(vault(), [sara, ali], t => (t.outputs[0] = withCommitment(t.outputs[0], h => byte(h, 4, '02')))),
    ).not.toBe(true);
    // A shorter wait than the rules say.
    expect(
      crafted(vault(), [sara, ali], t => (t.outputs[1] = withCommitment(t.outputs[1], h => h.slice(0, 166) + '0100'))),
    ).not.toBe(true);
    // A helper's card changes on the side.
    expect(
      crafted(
        vault(),
        [sara, ali],
        (t, src) =>
          (t.outputs[cardIdx(src, omar)] = withCommitment(t.outputs[cardIdx(src, omar)], h => byte(h, 21, '01'))),
      ),
    ).not.toBe(true);
    // A card that already has a request waiting.
    expect(
      crafted(vault(), [sara, ali], (t, src) => (src[1] = withCommitment(src[1], h => byte(h, 62, '01')))),
    ).not.toBe(true);
    // A non-helper's approval.
    expect(
      crafted(
        vault(),
        [sara, ali],
        cardBoth(sara, h => byte(h, 20, '02')),
      ),
    ).not.toBe(true);
    // No approvals at all when the rules say zero are needed.
    expect(
      crafted(
        vault(),
        [],
        rulesBoth(h => byte(h, 13, '00')),
      ),
    ).not.toBe(true);
  });

  it('crafted request to an empty key breaks', () => {
    const v = vault();
    const built = buildRecoveryRequest(v.params, v.coins, pkhOf(creator), newPhone.hex, false, feeWallet(sara));
    built.draft.venn!.lead[2] = new Uint8Array(20);
    built.draft.tx.outputs[1] = withCommitment(
      built.draft.tx.outputs[1],
      h => h.slice(0, 126) + '00'.repeat(20) + h.slice(166),
    );
    expect(consensus(signAll(built.draft, [sara, ali], sara), built.draft.sources)).not.toBe(true);
  });

  it('a stranger cannot approve for a helper', () => {
    const v = vault();
    const built = buildRecoveryRequest(v.params, v.coins, pkhOf(creator), newPhone.hex, false, feeWallet(sara));
    const entry = (k: Key, index: number) => {
      const sig = signVenn(built.draft, k.privateKey);
      return concat(Uint8Array.of(index), k.publicKey, Uint8Array.of(sig.length), sig);
    };
    const blob = concat(
      entry(sara, cardIdx(built.draft.sources, sara)),
      entry(key(77), cardIdx(built.draft.sources, ali)),
    );
    const lead = built.draft.venn!.lead;
    const tx = finalizeVenn(
      built.draft,
      [blob, ...lead.slice(1)],
      signFeeInputs(built.draft, sara.privateKey, sara.publicKey),
    );
    expect(consensus(tx, built.draft.sources)).not.toBe(true);
  });

  it('crafted cancellations by vote break', () => {
    const v = vault(STOP.VOTERS);
    const pending = after(v, request(v, [sara, ali]).tx);
    const cancel = (tweak: (t: Transaction, s: Output[]) => void, signers = [sara, ali, omar]) => {
      const built = buildRecoveryCancelByVote(pending.params, pending.coins, pkhOf(creator), feeWallet(sara));
      return consensus(signAll(built.draft, signers, sara, tweak), built.draft.sources);
    };
    // Rules that say only the key may stop requests.
    expect(cancel(rulesBoth(h => byte(h, 16, '01')))).not.toBe(true);
    // A signer who is not a voter.
    expect(cancel(cardBoth(sara, h => byte(h, 20, '08')))).not.toBe(true);
    // Nothing is waiting on the target.
    expect(cancel((t, src) => (src[1] = withCommitment(src[1], h => h.slice(0, 124) + '00'.repeat(23))))).not.toBe(
      true,
    );
  });

  it('completion needs a request, even if a new key is written on the card', () => {
    const v = vault();
    const pending = after(v, request(v, [sara, ali]).tx);
    const done = complete(pending, 3 * 512, (t, src) => (src[0] = withCommitment(src[0], h => byte(h, 62, '00'))));
    expect(consensus(done.tx, done.draft.sources)).not.toBe(true);
  });
});
