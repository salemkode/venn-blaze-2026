// Byte layouts of the two NFT commitments a Venn vault keeps: one card per person and
// one rules NFT. The contract reads exactly these offsets; keep both in step.
import { binToHex, concat, hexToBin, readUintLE, uintLE } from '../core/bytes';

export const ROLE = { SPEND: 1, VOTE: 2, REQUIRED: 4, HELPER: 8 } as const;
export const RULE = { LOCKED: 0, MAJORITY: 1, EVERYONE: 2 } as const;
export const STOP = { KEY: 1, VOTERS: 2, BOTH: 3 } as const;
export const BUDGET = { NONE: 0, REFILL: 1, FIXED: 2 } as const;

export const CARD_BYTES = 85;
export const RULES_BYTES = 54;
export const MAX_UNITS = 65535;
/** The contract's limit, so the largest vote still fits a standard transaction. */
export const MAX_VOTERS = 16;

export interface CardState {
  /** hash160 of the member's public key, hex. */
  pkh: string;
  roles: number;
  budgetMode: number;
  budget: bigint;
  /** Seconds. */
  period: bigint;
  /** Largest single payment, 0 = no cap. */
  cap: bigint;
  left: bigint;
  /** Time of the last spend (refilling) or start of the current period (fixed). */
  last: bigint;
  /** 0 none, 1 pending and the current key may cancel, 2 pending and it may not. */
  recovery: 0 | 1 | 2;
  newPkh: string;
  /** BIP68 512-second units the pending recovery must wait. */
  waitUnits: number;
}

export interface RulesState {
  version: 1;
  voters: number;
  required: number;
  membership: number;
  spending: number;
  recoveryRule: number;
  governance: number;
  payments: 1 | 2;
  recoveryOn: boolean;
  helpersNeeded: number;
  waitUnits: number;
  stopRule: 1 | 2 | 3;
  strongNeeded: number;
  strongWaitUnits: number;
  helpers: number;
}

const ZERO_PKH = '00'.repeat(20);
const MAX_AMOUNT = (1n << 63n) - 1n;

const pkhBytes = (hex: string, what: string) => {
  if (!/^[0-9a-f]{40}$/.test(hex)) throw new Error(`Invalid ${what}`);
  return hexToBin(hex);
};
const amount = (v: bigint, what: string) => {
  if (v < 0n || v > MAX_AMOUNT) throw new Error(`${what} is out of range`);
  return uintLE(v, 8);
};

export const encodeCardState = (c: CardState): string =>
  binToHex(
    concat(
      pkhBytes(c.pkh, 'member address'),
      uintLE(c.roles, 1),
      uintLE(c.budgetMode, 1),
      amount(c.budget, 'Budget'),
      amount(c.period, 'Budget period'),
      amount(c.cap, 'Payment cap'),
      amount(c.left, 'Budget left'),
      amount(c.last, 'Last spend time'),
      uintLE(c.recovery, 1),
      pkhBytes(c.newPkh, 'recovery address'),
      uintLE(c.waitUnits, 2),
    ),
  );

export const decodeCardState = (hex: string): CardState => {
  const b = hexToBin(hex);
  if (b.length !== CARD_BYTES) throw new Error('Not a Venn card');
  const recovery = b[62];
  if (recovery > 2) throw new Error('Not a Venn card');
  return {
    pkh: binToHex(b.slice(0, 20)),
    roles: b[20],
    budgetMode: b[21],
    budget: readUintLE(b, 22, 8),
    period: readUintLE(b, 30, 8),
    cap: readUintLE(b, 38, 8),
    left: readUintLE(b, 46, 8),
    last: readUintLE(b, 54, 8),
    recovery: recovery as 0 | 1 | 2,
    newPkh: binToHex(b.slice(63, 83)),
    waitUnits: Number(readUintLE(b, 83, 2)),
  };
};

export const encodeRulesState = (r: RulesState): string =>
  binToHex(
    concat(
      uintLE(r.version, 1),
      uintLE(r.voters, 2),
      uintLE(r.required, 1),
      uintLE(r.membership, 1),
      uintLE(r.spending, 1),
      uintLE(r.recoveryRule, 1),
      uintLE(r.governance, 1),
      uintLE(r.payments, 1),
      new Uint8Array(3),
      uintLE(r.recoveryOn ? 1 : 0, 1),
      uintLE(r.helpersNeeded, 1),
      uintLE(r.waitUnits, 2),
      uintLE(r.stopRule, 1),
      uintLE(r.strongNeeded, 1),
      uintLE(r.strongWaitUnits, 2),
      uintLE(r.helpers, 2),
      new Uint8Array(32),
    ),
  );

export const decodeRulesState = (hex: string): RulesState => {
  const b = hexToBin(hex);
  if (b.length !== RULES_BYTES || b[0] !== 1) throw new Error('Not Venn rules');
  const n = (o: number, len: number) => Number(readUintLE(b, o, len));
  return {
    version: 1,
    voters: n(1, 2),
    required: n(3, 1),
    membership: n(4, 1),
    spending: n(5, 1),
    recoveryRule: n(6, 1),
    governance: n(7, 1),
    payments: n(8, 1) as 1 | 2,
    recoveryOn: b[12] === 1,
    helpersNeeded: n(13, 1),
    waitUnits: n(14, 2),
    stopRule: n(16, 1) as 1 | 2 | 3,
    strongNeeded: n(17, 1),
    strongWaitUnits: n(18, 2),
    helpers: n(20, 2),
  };
};

export const isZeroPkh = (hex: string) => hex === ZERO_PKH;
export const ZERO_HASH160 = ZERO_PKH;

const units = (v: number) => Number.isInteger(v) && v >= 1 && v <= MAX_UNITS;

const has = (roles: number, role: number) => (roles & role) === role;

/**
 * The roles and budget of a card, checked exactly as the contract checks every card a vote
 * writes: a real role, required members vote, and a budget if and only if the member spends
 * alone, with a positive amount and period.
 */
export const validateCard = (c: Pick<CardState, 'roles' | 'budgetMode' | 'budget' | 'period' | 'cap'>): void => {
  if (!Number.isInteger(c.roles) || c.roles < 1 || c.roles > 15) throw new Error('Every member needs at least one role');
  if (has(c.roles, ROLE.REQUIRED) && !has(c.roles, ROLE.VOTE)) throw new Error('A required member must also vote');
  if (c.budgetMode === BUDGET.NONE) {
    if (has(c.roles, ROLE.SPEND)) throw new Error('A member who spends alone needs a budget');
    if (c.budget || c.period || c.cap) throw new Error('A member without a budget has budget settings');
    return;
  }
  if (c.budgetMode !== BUDGET.REFILL && c.budgetMode !== BUDGET.FIXED) throw new Error('Unknown budget type');
  if (!has(c.roles, ROLE.SPEND)) throw new Error('A budget needs the spend role');
  if (c.budget <= 0n || c.period <= 0n || c.cap < 0n) throw new Error('Budget amount and period must be positive');
  if (c.budget > MAX_AMOUNT || c.period > MAX_AMOUNT || c.cap > MAX_AMOUNT) throw new Error('Budget is out of range');
};

/** Throws a plain-English reason when the rules could not work as a vault. */
export const validateRules = (r: RulesState): void => {
  const rule = (v: number) => v === 0 || v === 1 || v === 2;
  if (r.version !== 1) throw new Error('Unknown rules version');
  if (!Number.isInteger(r.voters) || r.voters < 1) throw new Error('A vault needs at least one voter');
  if (r.voters > MAX_VOTERS) throw new Error(`A Venn can have at most ${MAX_VOTERS} voters`);
  if (r.required < 0 || r.required > r.voters || r.required > 0xff)
    throw new Error('Required members must also be voters');
  if (![r.membership, r.spending, r.recoveryRule, r.governance].every(rule)) throw new Error('Unknown change rule');
  if (r.payments !== 1 && r.payments !== 2) throw new Error('Bigger payments need majority or everyone');
  if (r.helpers < 0 || r.helpers > 0xffff) throw new Error('Too many helpers');
  if (![1, 2, 3].includes(r.stopRule)) throw new Error('Unknown stop rule');
  if (!r.recoveryOn) {
    if (r.helpersNeeded || r.waitUnits || r.strongNeeded || r.strongWaitUnits)
      throw new Error('Recovery is off but has settings');
    return;
  }
  if (r.helpersNeeded < 1 || r.helpersNeeded > r.helpers || r.helpersNeeded > 0xff)
    throw new Error('Not enough helpers for recovery');
  if (!units(r.waitUnits)) throw new Error('Recovery wait is out of range');
  if (r.stopRule === STOP.BOTH) {
    if (r.strongNeeded < r.helpersNeeded || r.strongNeeded > r.helpers || r.strongNeeded > 0xff)
      throw new Error('The strong recovery path needs at least as many helpers as the normal one');
    if (!units(r.strongWaitUnits) || r.strongWaitUnits < r.waitUnits)
      throw new Error('The strong recovery path must wait at least as long');
  } else if (r.strongNeeded || r.strongWaitUnits) {
    throw new Error('Only stop rule C has a strong recovery path');
  }
};
