// Reopening an old, saved WizardConnect pairing must not wait for the other wallet or its
// relay: a returning visitor's app has to show up even when that wallet is long gone.
import { expect, it, vi } from 'vitest';

const relays = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock('@wizardconnect/core', () => ({
  // The relay to the old wallet never connects and never calls back.
  initiateDappRelay: (_status: unknown, options: unknown) => {
    relays.calls.push(options);
    return { uri: '', qrUri: '', cleanup: vi.fn() };
  },
}));
vi.mock('@wizardconnect/dapp', () => ({
  DappConnectionManager: class {
    attachRelay() {}
    restoreSessionPaths() {}
    once() {}
    signTransaction() {
      return new Promise(() => {});
    }
    sendDisconnect = vi.fn(async () => {});
    destroy = vi.fn(async () => {});
  },
}));

const { openConnection } = await import('../../src/wallet/relay');

const stale = {
  privateKey: 'a'.repeat(64),
  secret: 'old-pairing-secret',
  walletPublicKey: 'b'.repeat(64),
  walletName: 'Cashonize',
  paths: [{ name: 'receive', xpub: 'xpub6stale' }],
};

it('reopens a stale pairing at once, without waiting on its relay', () => {
  const link = openConnection(stale, () => {});
  expect(link.connection.walletName).toBe('Cashonize');
  expect(relays.calls).toHaveLength(1);
  expect(relays.calls[0]).toMatchObject({ existingCredentials: { secret: 'old-pairing-secret' } });
  expect(typeof link.signer).toBe('function');
});

it('closes a stale pairing without waiting for the other wallet', async () => {
  const link = openConnection(stale, () => {});
  await expect(Promise.race([link.close(true), new Promise((_, no) => setTimeout(() => no(new Error('waited')), 500))])).resolves.toBeUndefined();
});
