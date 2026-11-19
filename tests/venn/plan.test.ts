import { describe, expect, it } from 'vitest';
import { binToHex } from '../../src/core/bytes';
import { p2pkhForPublicKey, signPersonal } from '../../src/core/draft';
import { buildVennGenesis } from '../../src/venn/build';
import { readMarker } from '../../src/venn/chain';
import {
  accept,
  decodeAcceptance,
  decodeInvite,
  encodeAcceptance,
  encodeInvite,
  fingerprint,
  inviteFor,
  membersFor,
} from '../../src/venn/invite';
import { ROLE, RULE, STOP } from '../../src/venn/layout';
import { type VennType, TYPES, checkPlan, presetPlan } from '../../src/venn/presets';
import { summarize } from '../../src/venn/summary';
import { verifyGenesis } from '../../src/venn/verify';
import { vmVerify } from '../helpers';
import { people, wallet } from './fixtures';

const you = { name: 'Sara', publicKey: people.creator.hex };
const others = [
  { name: 'Ali', publicKey: '' },
  { name: 'Omar', publicKey: '' },
];

describe('the four kinds of Venn', () => {
  it.each(Object.keys(TYPES) as VennType[])('%s is a valid starting plan', type => {
    const plan = presetPlan(type, you, others);
    expect(() => checkPlan(plan)).not.toThrow();
    expect(plan.members.map(m => m.name)).toEqual(['Sara', 'Ali', 'Omar']);
  });

  it('personal: you spend and must sign; friends vote and help recover', () => {
    const plan = presetPlan('personal', you, others);
    expect(plan.members[0].roles).toBe(ROLE.SPEND | ROLE.VOTE | ROLE.REQUIRED);
    expect(plan.members[1].roles).toBe(ROLE.VOTE | ROLE.HELPER);
    expect(plan.settings.stopRule).toBe(STOP.BOTH);
  });

  it('pot and circle: nobody spends alone; a circle keeps a turn order', () => {
    for (const type of ['pot', 'circle'] as const) {
      const plan = presetPlan(type, you, others);
      expect(plan.members.every(m => !(m.roles & ROLE.SPEND))).toBe(true);
    }
    expect(presetPlan('circle', you, others).turns).toEqual([0, 1, 2]);
    expect(presetPlan('circle', you, others).settings.membership).toBe(RULE.EVERYONE);
  });

  it('refuses a plan where recovery cannot work', () => {
    const plan = presetPlan('shared', you, others);
    plan.settings = { ...plan.settings, helpersNeeded: 4 };
    expect(() => checkPlan(plan)).toThrow(/helpers/);
  });

  it('every summary line that has a weakness says it', () => {
    const plan = presetPlan('shared', you, others);
    const lines = summarize(plan.members, plan.settings);
    expect(lines[0].text).toMatch(/^Sara can pay alone/);
    expect(lines.some(l => /2 of 3 helpers/.test(l.text))).toBe(true);
    expect(lines.filter(l => l.weakness).length).toBeGreaterThan(5);
  });
});

describe('consent and creation', () => {
  const plan = presetPlan('shared', you, others);
  const invite = decodeInvite(encodeInvite(inviteFor(plan, 'chipnet')));
  const answers = [encodeAcceptance(accept(invite, 1, people.ali)), encodeAcceptance(accept(invite, 2, people.omar))];

  it('an acceptance signs this plan and this seat only', () => {
    expect(decodeAcceptance(answers[0], invite).publicKey).toBe(people.ali.hex);
    const other = inviteFor({ ...plan, name: 'Another' }, 'chipnet');
    expect(() => decodeAcceptance(answers[0], other)).toThrow(/different plan/);
    const forged = { ...accept(invite, 1, people.ali), seat: 2 };
    expect(() => decodeAcceptance(encodeAcceptance(forged), invite)).toThrow(/not signed correctly/);
  });

  it('waits for everyone, then creates a Venn the VM accepts and members can find', () => {
    expect(() => membersFor(invite, people.creator.hex, [decodeAcceptance(answers[0], invite)])).toThrow(/Omar/);
    const members = membersFor(
      invite,
      people.creator.hex,
      answers.map(a => decodeAcceptance(a, invite)),
    );
    const funding = wallet(people.creator, 2_000_000n, 7, 0);
    const { params, draft } = buildVennGenesis({
      utxos: [funding],
      publicKey: people.creator.publicKey,
      network: 'chipnet',
      members,
      settings: invite.settings as never,
      deposit: 100_000n,
      gas: 2_000n,
      plan: fingerprint(invite),
    });
    const tx = signPersonal(draft, people.creator.privateKey, people.creator.publicKey);
    expect(vmVerify(tx, draft.sources)).toBe(true);
    expect(verifyGenesis(params, tx).cards.map(c => c.roles)).toEqual(members.map(m => m.roles));
    expect(readMarker(tx)).toEqual({ category: params.vaultCategory, plan: fingerprint(invite) });
    // Each member is paid a little BCH, which is how their app finds the Venn.
    const paid = tx.outputs.map(o => binToHex(o.lockingBytecode));
    for (const who of [people.ali, people.omar]) expect(paid).toContain(binToHex(p2pkhForPublicKey(who.publicKey)));
  });
});

describe('presets keep every seat recoverable', () => {
  const you = { name: 'You', publicKey: '' };
  const sam = { name: 'Sam', publicKey: '' };
  const lee = { name: 'Lee', publicKey: '' };

  it('two people who help each other need one helper, never the seat being recovered', () => {
    for (const type of ['shared', 'pot', 'circle'] as const) {
      const plan = presetPlan(type, you, [sam]);
      expect(plan.settings.helpersNeeded).toBe(1);
      expect(() => checkPlan(plan)).not.toThrow();
    }
    expect(presetPlan('shared', you, [sam, lee]).settings.helpersNeeded).toBe(2);
  });

  it('a plan whose creator could never be recovered is refused', () => {
    const plan = presetPlan('shared', you, [sam]);
    expect(() => checkPlan({ ...plan, settings: { ...plan.settings, helpersNeeded: 2 } })).toThrow(/could never be recovered/);
  });
});
