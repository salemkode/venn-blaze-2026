// "Try a Venn" runs the real builders through the real BCH VM: create, pay, overspend, close.
import { expect, it } from 'vitest';
import {
  BUDGET_CENTS,
  DEPOSIT_CENTS,
  FIRST_PAYMENT,
  closeAndRefund,
  createPlayground,
  overspend,
  payWithinBudget,
} from '../../src/venn/playground';
import { vmVerify } from '../../src/venn/vm';

it('creates, pays within budget, is refused by the VM when overspending, and refunds', () => {
  const created = createPlayground();
  expect(created.step.vm).toBe(true);
  expect(created.state.balance).toBe(DEPOSIT_CENTS);
  expect(created.state.available).toBe(BUDGET_CENTS);

  const paid = payWithinBudget(created.state);
  expect(paid.step.vm).toBe(true);
  expect(paid.state.balance).toBe(DEPOSIT_CENTS - FIRST_PAYMENT);
  expect(paid.state.available).toBe(BUDGET_CENTS - FIRST_PAYMENT);

  const over = overspend(paid.state);
  expect(over.appRefusal).toMatch(/refuses to sign: \$0.80 is more than the \$0.30/);
  expect(over.step.vm).not.toBe(true);
  expect(over.step.ok).toBe(true); // ok means "refused, as it should be"

  const closed = closeAndRefund(paid.state);
  expect(closed.step.vm).toBe(true);
  expect(closed.state.balance).toBe(0n);
});

it('uses fresh keys each time', () => {
  expect(createPlayground().state.you.hex).not.toBe(createPlayground().state.you.hex);
});

it('the app-side VM wrapper rejects a malformed transaction instead of throwing', () => {
  const verdict = vmVerify({ version: 2, locktime: 0, inputs: [], outputs: [] }, []);
  expect(verdict).not.toBe(true);
});
