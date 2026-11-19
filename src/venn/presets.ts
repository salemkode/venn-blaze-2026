// The four kinds of Venn. Each is a starting point: every value can be changed before
// the Venn is created. Every option carries the weakness the app shows next to it.
import { type MemberSpec, type RulesSettings, cardFor, rulesFor, validateMember } from './build';
import { BUDGET, ROLE, RULE, STOP } from './layout';

export type VennType = 'personal' | 'shared' | 'pot' | 'circle';

export interface Person {
  name: string;
  /** The person's Venn key, hex; empty until they accept the invitation. */
  publicKey: string;
}

export interface Plan {
  type: VennType;
  name: string;
  members: (MemberSpec & { name: string })[];
  settings: RulesSettings;
  /** Circle only: the order members receive the pot, as seat numbers. */
  turns?: number[];
  /** Circle only: what everyone pays each round, and how long a round lasts (seconds). */
  circle?: { contribution: bigint; period: bigint };
}

/** A Circle's members and rounds, as the Circle contract allows. */
export const MIN_CIRCLE_MEMBERS = 2;
export const MAX_CIRCLE_MEMBERS = 16;

export const DAY = 86_400n;
/** BIP68 units of 512 seconds. */
export const daysToUnits = (days: number) => Math.ceil((days * 86_400) / 512);
export const unitsToDays = (units: number) => Math.round((units * 512) / 86_400);

export const TYPES: Record<VennType, { title: string; line: string; explain: string; weakness: string }> = {
  personal: {
    title: 'Personal',
    line: 'Your money, guarded by people you trust.',
    explain:
      'You spend alone within a budget that refills. Friends vote with you on bigger payments and can give you a new key if you lose your phone.',
    weakness: 'Enough of your friends working together can take over your place after the waiting period.',
  },
  shared: {
    title: 'Shared',
    line: 'For a household, a couple or a team.',
    explain: 'Everyone spends day to day within their own budget. Bigger payments and rule changes need a majority.',
    weakness: 'A majority can act against the others, and anyone can spend their whole budget at once.',
  },
  pot: {
    title: 'Pot',
    line: 'Collect together for a goal.',
    explain: 'Everyone adds money for a trip, a gift or a project. Nobody spends alone: every payment needs a vote.',
    weakness: 'Slow: nothing moves until enough people answer.',
  },
  circle: {
    title: 'Circle',
    line: 'A jam’eya: take turns receiving the pot.',
    explain:
      'Each round everyone pays the same amount in, and the whole pot goes to the member whose turn it is. The contract fixes the turn order and the amount, and pays out as soon as everyone has paid or the round’s deadline passes.',
    weakness:
      'The contract cannot make anyone pay. Someone who stops paying after their own turn keeps what they received; the Circle records every missed payment for everyone to see.',
  },
};

export const WEAKNESS = {
  roles: {
    [ROLE.SPEND]: 'Can spend alone up to their budget.',
    [ROLE.VOTE]: 'Counts toward every vote.',
    [ROLE.REQUIRED]: 'Must sign every vote. If they lose their key, nothing but recovery can unlock votes.',
    [ROLE.HELPER]: 'Helps give a member a new key. Enough helpers together can take over a card after the wait.',
  },
  budget: {
    [BUDGET.NONE]: 'Spends only through votes.',
    [BUDGET.REFILL]: 'The whole budget can be spent at once, then it refills over the period.',
    [BUDGET.FIXED]: 'Unused budget carries over: after idle periods, several periods’ worth can be spent at once.',
  },
  cap: 'Several payments can still add up to the full budget.',
  rule: {
    [RULE.LOCKED]: 'Can never change in this Venn. The only way out is moving the money, if allowed.',
    [RULE.MAJORITY]: 'More than half of the voters can act against the others.',
    [RULE.EVERYONE]: 'One lost phone or one person who stops answering freezes it, unless recovery replaces their key.',
  },
  recoveryOff: 'Losing a key loses that person’s place and anything only they could unlock.',
  stop: {
    [STOP.KEY]: 'A thief with the old key can block the recovery.',
    [STOP.VOTERS]: 'If helpers collude, the member has only the wait to gather a majority against them.',
    [STOP.BOTH]: 'More to understand; the stronger path is a takeover path if that many helpers collude.',
  },
};

export const RECOVERY_OFF = {
  recoveryOn: false,
  helpersNeeded: 0,
  waitUnits: 0,
  stopRule: STOP.VOTERS,
  strongNeeded: 0,
  strongWaitUnits: 0,
} as const;
const off = RECOVERY_OFF;

const majority = (n: number) => Math.floor(n / 2) + 1;

const budgetMember = (p: Person, roles: number, budget: bigint): MemberSpec & { name: string } => ({
  name: p.name,
  publicKey: p.publicKey,
  roles: roles | ROLE.SPEND,
  budgetMode: BUDGET.REFILL,
  budget,
  period: DAY,
  cap: 0n,
});

const voter = (p: Person, roles: number): MemberSpec & { name: string } => ({
  name: p.name,
  publicKey: p.publicKey,
  roles,
  budgetMode: BUDGET.NONE,
  budget: 0n,
  period: 0n,
  cap: 0n,
});

/**
 * Recovery for `helpers` helpers. When every member helps (`selfHelp`), the seat being
 * recovered cannot approve its own request, so at most helpers − 1 can ever approve.
 */
const recovery = (helpers: number, stopRule: 1 | 2 | 3, days = 7, selfHelp = false) => {
  const available = selfHelp ? helpers - 1 : helpers;
  const helpersNeeded = Math.min(majority(helpers), available);
  return {
    recoveryOn: true,
    helpersNeeded,
    waitUnits: daysToUnits(days),
    stopRule,
    strongNeeded: stopRule === STOP.BOTH ? available : 0,
    strongWaitUnits: stopRule === STOP.BOTH ? daysToUnits(days * 2) : 0,
  };
};

/**
 * A starting plan. `you` is the creator; `others` are everyone else. `budget` is the daily
 * budget in satoshis (or token units) for members who spend alone.
 */
export const presetPlan = (type: VennType, you: Person, others: Person[], budget = 100_000n): Plan => {
  const name = `${TYPES[type].title} Venn`;
  if (type === 'personal') {
    const members = [
      budgetMember(you, ROLE.VOTE | ROLE.REQUIRED, budget),
      ...others.map(p => voter(p, ROLE.VOTE | ROLE.HELPER)),
    ];
    return {
      type,
      name,
      members,
      settings: {
        membership: RULE.MAJORITY,
        spending: RULE.MAJORITY,
        recoveryRule: RULE.MAJORITY,
        governance: RULE.MAJORITY,
        payments: RULE.MAJORITY,
        ...(others.length ? recovery(others.length, STOP.BOTH) : off),
      },
    };
  }
  const everyone = [you, ...others];
  if (type === 'shared') {
    return {
      type,
      name,
      members: everyone.map(p => budgetMember(p, ROLE.VOTE | ROLE.HELPER, budget)),
      settings: {
        membership: RULE.MAJORITY,
        spending: RULE.MAJORITY,
        recoveryRule: RULE.MAJORITY,
        governance: RULE.MAJORITY,
        payments: RULE.MAJORITY,
        ...(everyone.length > 1 ? recovery(everyone.length, STOP.VOTERS, 7, true) : off),
      },
    };
  }
  return {
    type,
    name,
    members: everyone.map(p => voter(p, ROLE.VOTE | ROLE.HELPER)),
    settings: {
      membership: type === 'circle' ? RULE.EVERYONE : RULE.MAJORITY,
      spending: RULE.MAJORITY,
      recoveryRule: RULE.MAJORITY,
      governance: type === 'circle' ? RULE.EVERYONE : RULE.MAJORITY,
      payments: RULE.MAJORITY,
      ...(everyone.length > 1 ? recovery(everyone.length, STOP.VOTERS, 7, true) : off),
    },
    ...(type === 'circle'
      ? { turns: everyone.map((_, seat) => seat), circle: { contribution: budget, period: 30n * DAY } }
      : {}),
  };
};

const PLACEHOLDER_KEY = '02' + '11'.repeat(32);

/** Throws the first reason this plan could not become a Venn. */
export function checkPlan(plan: Plan) {
  if (plan.type === 'circle') return checkCirclePlan(plan);
  const members = plan.members.map((m, n) => ({
    ...m,
    publicKey: m.publicKey || PLACEHOLDER_KEY.slice(0, -2) + n.toString(16).padStart(2, '0'),
  }));
  members.forEach(validateMember);
  rulesFor(plan.settings, members.map(cardFor));
  if (!plan.members.some(m => m.roles & ROLE.VOTE)) throw new Error('At least one person must vote.');
  // Helpers never approve their own seat's recovery: the creator's seat must stay recoverable.
  if (plan.settings.recoveryOn) {
    const others = plan.members.slice(1).filter(m => m.roles & ROLE.HELPER).length;
    if (others < plan.settings.helpersNeeded)
      throw new Error(
        `Recovery needs ${plan.settings.helpersNeeded} helpers, but only ${others} other ${others === 1 ? 'person helps' : 'people help'}: ${plan.members[0].name}’s seat could never be recovered.`,
      );
  }
}

/** A Circle needs 2 to 16 people, a contribution, rounds of at least a day and a full turn order. */
export function checkCirclePlan(plan: Plan) {
  const n = plan.members.length;
  if (n < MIN_CIRCLE_MEMBERS) throw new Error('A Circle needs at least two people.');
  if (n > MAX_CIRCLE_MEMBERS) throw new Error(`A Circle holds at most ${MAX_CIRCLE_MEMBERS} people.`);
  if (!plan.circle || plan.circle.contribution <= 0n) throw new Error('Choose how much everyone pays each round.');
  if (plan.circle.period < DAY) throw new Error('A round must last at least a day.');
  const turns = plan.turns ?? [];
  if (turns.length !== n || new Set(turns).size !== n || turns.some(t => t < 0 || t >= n))
    throw new Error('Every person needs exactly one turn.');
}
