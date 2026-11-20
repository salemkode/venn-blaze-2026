// Pairing the same wallet again must replace its old relay session. The old one may be dead
// (the wallet's tab was closed), and keeping it leaves every payment waiting for an approval
// that never arrives.
import { beforeEach, expect, it, vi } from 'vitest';
import { decodeConnection, type Connection } from '../../src/wallet/connection';

const store = new Map<string, string>();
vi.mock('react-native-keychain', () => ({
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x' },
  getGenericPassword: vi.fn(async ({ service }: { service: string }) =>
    store.has(service) ? { username: 'venn', password: store.get(service) } : false,
  ),
  setGenericPassword: vi.fn(async (_user: string, value: string, { service }: { service: string }) => {
    store.set(service, value);
    return true;
  }),
  resetGenericPassword: vi.fn(async ({ service }: { service: string }) => store.delete(service)),
}));
vi.mock('react-native-libauth', () => ({ initializeLibauth: vi.fn(async () => {}) }));

const { addConnectedWallet, readRegistry, readSecret } = await import('../../src/wallet/secure');

const pairing = (key: string, receive = 'xpub6receive'): Connection => ({
  privateKey: key.repeat(64),
  secret: `secret-${key}-1234`,
  walletPublicKey: 'b'.repeat(64),
  walletName: 'Cashonize',
  paths: [
    { name: 'receive', xpub: receive },
    { name: 'change', xpub: 'xpub6change' },
  ],
});

beforeEach(() => store.clear());

it('replaces the saved session when the same wallet is paired again', async () => {
  const first = await addConnectedWallet(pairing('1'));
  const again = await addConnectedWallet(pairing('2'));

  expect(again.wallets).toHaveLength(1);
  expect(again.activeId).toBe(first.activeId);
  const saved = decodeConnection((await readSecret(again.activeId)) ?? '');
  expect(saved?.privateKey).toBe('2'.repeat(64));
  expect(saved?.secret).toBe('secret-2-1234');
});

it('adds a different wallet as a new entry and makes it active', async () => {
  const first = await addConnectedWallet(pairing('1'));
  const other = await addConnectedWallet(pairing('3', 'xpub6other'));

  expect(other.wallets).toHaveLength(2);
  expect(other.activeId).not.toBe(first.activeId);
  expect((await readRegistry())?.activeId).toBe(other.activeId);
});
