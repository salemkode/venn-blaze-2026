// A payment shown as pending must clear once the network has it, even when the wallet library
// already dropped its own record during a refresh (seen on Mainnet: a confirmed payment stayed
// "pending" and blocked Send and wallet switching).
import { expect, it, vi } from 'vitest';

vi.mock('react-native-xo', () => ({ createWallet: vi.fn(), connectWallet: vi.fn() }));
vi.mock('../../src/wallet/secure', () => ({ saveConnection: vi.fn() }));

const { checkPendingPayment } = await import('../../src/wallet/session');

const wallet = (checked: unknown, lookup: () => Promise<{ found: boolean }>) => ({
  checkPending: vi.fn(async () => checked as never),
  lookupTransaction: vi.fn(lookup),
});

it('uses the library result when it still has the record', async () => {
  const w = wallet({ resolved: true, status: 'confirmed' }, async () => ({ found: true }));
  await expect(checkPendingPayment(w, 'ab')).resolves.toEqual({ resolved: true, status: 'confirmed' });
  expect(w.lookupTransaction).not.toHaveBeenCalled();
});

it('clears a payment the library forgot once the transaction is found', async () => {
  const w = wallet(null, async () => ({ found: true }));
  await expect(checkPendingPayment(w, 'ab')).resolves.toEqual({ resolved: true, status: 'seen' });
});

it('reports coins spent elsewhere when the server has no such transaction', async () => {
  const w = wallet(null, async () => {
    throw new Error('No such mempool or blockchain transaction');
  });
  await expect(checkPendingPayment(w, 'ab')).resolves.toEqual({ resolved: true, status: 'conflicted' });
});

it('keeps it pending when the network cannot be reached', async () => {
  const w = wallet(null, async () => {
    throw new Error('Could not reach the mainnet network.');
  });
  await expect(checkPendingPayment(w, 'ab')).resolves.toEqual({ resolved: false, status: 'unknown' });
});
