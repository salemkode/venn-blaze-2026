// A connected wallet on the other network must be explained in Venn's own words.
import { expect, it, vi } from 'vitest';
import { explainOpenError } from '../../src/wallet/session';

vi.mock('react-native-xo', () => ({ createWallet: vi.fn(), connectWallet: vi.fn() }));
vi.mock('../../src/wallet/secure', () => ({ saveConnection: vi.fn() }));

const mismatch = Object.assign(new Error('The connected wallet is on Mainnet; switch Gam’eya to the same network.'), {
  code: 'wrong-network',
});

it('names Venn and both networks when a connected wallet is on the other network', () => {
  const explained = explainOpenError(mismatch, 'Cashonize', 'chipnet') as Error;
  expect(explained.message).toBe(
    'Cashonize is connected on Mainnet, but Venn is on Chipnet. Switch Venn back to Mainnet, or connect a wallet that is on Chipnet.',
  );
  expect(explained.message).not.toMatch(/Gam/);
});

it('passes other errors through unchanged', () => {
  const other = new Error('relay closed');
  expect(explainOpenError(other, 'Cashonize', 'mainnet')).toBe(other);
});
