// QA 21 Nov (B1): in a two-person Shared Venn with "stop = voters", one member could start a
// recovery on the other's seat and nobody could stop it. New plans refuse that, existing Venns get
// a rules vote that fixes it, and every review says what the request freezes and who can stop it.
import { describe, expect, it } from 'vitest';
import { binToHex } from '../../src/core/bytes';
import { hash160 } from '../../src/core/crypto';
import type { Transaction } from '../../src/core/tx';
import {
  buildRecoveryCancelByKey,
  buildRecoveryCancelByVote,
  buildRecoveryRequest,
  buildVote,
  finalizeRecovery,
  finalizeVote,
  signFeeInputs,
  signVenn,
} from '../../src/venn/build';
import { vennCoins } from '../../src/venn/coins';
import { vennLocking } from '../../src/venn/contract';
import { BUDGET, ROLE, STOP, decodeCardState, decodeRulesState } from '../../src/venn/layout';
import { checkPlan, presetPlan } from '../../src/venn/presets';
import { proposalFor, recoveryWarning } from '../../src/venn/proposal';
import { defaultStopRule, freezeWarning, othersCanOutvote, unstoppableReason, whoCanStop } from '../../src/venn/recoveryGuard';
import { summarize } from '../../src/venn/summary';
import { utxoFrom, vmVerify } from '../helpers';
import { feeWallet, makeVault, member, people } from './fixtures';

const { creator, sara, newPhone } = people;
const pkhOf = (k: { publicKey: Uint8Array }) => binToHex(hash160(k.publicKey));
const VH = ROLE.VOTE | ROLE.HELPER;
const budget = { budgetMode: BUDGET.REFILL, budget: 5n, period: 86_400n };

/** A two-person Shared Venn like the QA household: both spend, vote and help. */
const household = (stopRule: 1 | 2 | 3) =>
  makeVault({
    members: [member(creator, ROLE.SPEND | VH, budget), member(sara, ROLE.SPEND | VH, budget)],
    settings: {
      stopRule,
      helpersNeeded: 1,
      waitUnits: 3,
      strongNeeded: stopRule === STOP.BOTH ? 1 : 0,
      strongWaitUnits: stopRule === STOP.BOTH ? 6 : 0,
    },
  });
type V = ReturnType<typeof household>;

const after = (v: V, tx: Transaction): V => {
  const lock = vennLocking(v.params);
  const kept = v.utxos.filter(u => !tx.inputs.some(i => i.txid === u.txid && i.vout === u.vout));
  const fresh = tx.outputs
    .map((o, i) => [o, i] as const)
    .filter(([o]) => binToHex(o.lockingBytecode) === binToHex(lock))
    .map(([, i]) => utxoFrom(tx, i, 300));
  const utxos = [...kept, ...fresh];
  return { ...v, utxos, coins: vennCoins(v.params, utxos)! };
};

/** The creator asks to give Sara's seat a new key (as Sam did to Lee). */
const requestOnSara = (v: V) => {
  const built = buildRecoveryRequest(v.params, v.coins, pkhOf(sara), newPhone.hex, false, feeWallet(creator));
  const tx = finalizeRecovery(
    built.draft,
    [{ publicKey: creator.hex, signature: signVenn(built.draft, creator.privateKey) }],
    signFeeInputs(built.draft, creator.privateKey, creator.publicKey),
  );
  expect(vmVerify(tx, built.draft.sources)).toBe(true);
  return { built, tx };
};

describe('who can stop a recovery request', () => {
  it('two voters can never outvote each other; three can', () => {
    expect(othersCanOutvote(2, true)).toBe(false);
    expect(othersCanOutvote(3, true)).toBe(true);
    expect(othersCanOutvote(2, false)).toBe(true);
    expect(defaultStopRule(2)).toBe(STOP.KEY);
    expect(defaultStopRule(3)).toBe(STOP.VOTERS);
    expect(whoCanStop(STOP.VOTERS, 2, true)).toEqual({ key: false, voters: false });
    expect(whoCanStop(STOP.KEY, 2, true)).toEqual({ key: true, voters: false });
    expect(whoCanStop(STOP.BOTH, 2, true, true)).toEqual({ key: false, voters: false });
    expect(unstoppableReason({ recoveryOn: true, stopRule: STOP.VOTERS }, 2)).toMatch(/nobody could stop/);
    expect(unstoppableReason({ recoveryOn: true, stopRule: STOP.KEY }, 2)).toBe('');
    expect(unstoppableReason({ recoveryOn: false, stopRule: STOP.VOTERS }, 2)).toBe('');
  });

  it('the review states the freeze, and says plainly when nobody can stop it', () => {
    const none = freezeWarning('Lee', 24, { key: false, voters: false });
    expect(none.danger).toBe(true);
    expect(none.text).toMatch(/Lee’s seat cannot spend or vote/);
    expect(none.text).toMatch(/Nobody can stop it/);
    expect(freezeWarning('Lee', 24, { key: true, voters: false })).toEqual(
      expect.objectContaining({ danger: false, text: expect.stringMatching(/Lee’s own key can stop it/) }),
    );
  });
});

describe('new plans', () => {
  const you = { name: 'Sam', publicKey: creator.hex };
  const lee = { name: 'Lee', publicKey: sara.hex };
  const kim = { name: 'Kim', publicKey: newPhone.hex };

  it('a two-person Shared or Pot Venn lets the seat’s own key stop requests, and passes', () => {
    for (const type of ['shared', 'pot'] as const) {
      const plan = presetPlan(type, you, [lee]);
      expect(plan.settings.stopRule).toBe(STOP.KEY);
      expect(() => checkPlan(plan)).not.toThrow();
    }
    expect(presetPlan('shared', you, [lee, kim]).settings.stopRule).toBe(STOP.VOTERS);
    expect(presetPlan('personal', you, [lee]).settings.stopRule).toBe(STOP.KEY);
    expect(presetPlan('personal', you, [lee, kim]).settings.stopRule).toBe(STOP.BOTH);
  });

  it('refuses "stop = voters" (or Both) when the voters could never outvote each other', () => {
    const plan = presetPlan('shared', you, [lee]);
    expect(() => checkPlan({ ...plan, settings: { ...plan.settings, stopRule: STOP.VOTERS } })).toThrow(/Their key/);
    expect(() =>
      checkPlan({ ...plan, settings: { ...plan.settings, stopRule: STOP.BOTH, strongNeeded: 1, strongWaitUnits: plan.settings.waitUnits * 2 } }),
    ).toThrow(/Their key/);
  });

  it('the rules summary no longer promises a majority that cannot exist', () => {
    const plan = presetPlan('shared', you, [lee]);
    const seats = plan.members.map(m => ({ ...m, name: m.name }));
    const text = summarize(seats as never, { ...plan.settings, stopRule: STOP.VOTERS } as never)
      .map(l => l.text)
      .join(' ');
    expect(text).toMatch(/Nobody can stop a request on a voter’s seat/);
    expect(text).not.toMatch(/A majority of voters can stop/);
  });
});

describe('in the BCH VM', () => {
  it('an existing two-voter "stop = voters" Venn: the request is valid, nobody can stop it, and the review says so', () => {
    const v = household(STOP.VOTERS);
    const { built } = requestOnSara(v);
    expect(() => buildRecoveryCancelByVote(v.params, after(v, requestOnSara(v).tx).coins, pkhOf(sara), feeWallet(creator))).toThrow(
      /Not enough other voters/,
    );
    const warning = recoveryWarning(proposalFor('recoveryRequest', built.draft, 'Give Lee’s seat a new key', built.need), {
      [pkhOf(sara)]: 'Lee',
    });
    expect(warning?.danger).toBe(true);
    expect(warning?.text).toMatch(/Lee’s seat cannot spend or vote/);
    expect(warning?.text).toMatch(/Nobody can stop it/);
  });

  it('the rules vote that fixes it is valid, and afterwards the seat’s own key stops a request', () => {
    const v = household(STOP.VOTERS);
    const vote = buildVote(v.params, v.coins, { settings: { stopRule: STOP.KEY, strongNeeded: 0, strongWaitUnits: 0 } }, feeWallet(creator));
    const approvals = [creator, sara].map(k => ({ publicKey: k.hex, signature: signVenn(vote.draft, k.privateKey) }));
    const voteTx = finalizeVote(vote.draft, approvals, signFeeInputs(vote.draft, creator.privateKey, creator.publicKey));
    expect(vmVerify(voteTx, vote.draft.sources)).toBe(true);
    const fixed = after(v, voteTx);
    expect(decodeRulesState(fixed.coins.rules.token!.nft!.commitment).stopRule).toBe(STOP.KEY);

    const { built, tx } = requestOnSara(fixed);
    const warning = recoveryWarning(proposalFor('recoveryRequest', built.draft, 'x', built.need), { [pkhOf(sara)]: 'Lee' });
    expect(warning).toEqual({ danger: false, text: expect.stringMatching(/Lee’s own key can stop it/) });
    const pending = after(fixed, tx);
    const stop = buildRecoveryCancelByKey(pending.params, pending.coins, pkhOf(sara), feeWallet(sara));
    const stopTx = finalizeRecovery(
      stop,
      { publicKey: sara.hex, signature: signVenn(stop, sara.privateKey) },
      signFeeInputs(stop, sara.privateKey, sara.publicKey),
    );
    expect(vmVerify(stopTx, stop.sources)).toBe(true);
    expect(decodeCardState(stopTx.outputs[0].token!.nft!.commitment).recovery).toBe(0);
  });
});
