// Budget and vote arithmetic, identical to what the contract enforces.
import { BUDGET, type CardState, RULE } from './layout';

/** What the member may spend at `now` (seconds), and the `last` the card will store. */
export const availableBudget = (c: CardState, now: bigint): { available: bigint; nextLast: bigint } => {
  if (now < c.last) throw new Error('The time given is earlier than the card’s last spend');
  if (c.budgetMode === BUDGET.REFILL) {
    if (c.period <= 0n) throw new Error('Budget period must be positive');
    // Only the time the refill used up is consumed, so no partial refill is lost.
    const gained = (c.budget * (now - c.last)) / c.period;
    if (c.left + gained >= c.budget) return { available: c.budget, nextLast: now };
    return { available: c.left + gained, nextLast: c.last + (gained * c.period + c.budget - 1n) / c.budget };
  }
  if (c.budgetMode === BUDGET.FIXED) {
    if (c.period <= 0n) throw new Error('Budget period must be positive');
    return now >= c.last + c.period ? { available: c.budget, nextLast: now } : { available: c.left, nextLast: c.last };
  }
  return { available: 0n, nextLast: c.last };
};

/** Signatures a change needs, or null when the setting is locked. */
export const voteNeed = (rule: number, voters: number): number | null => {
  if (rule === RULE.MAJORITY) return Math.floor(voters / 2) + 1;
  if (rule === RULE.EVERYONE) return voters;
  return null;
};
