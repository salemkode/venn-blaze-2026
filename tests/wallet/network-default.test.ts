// Venn starts on Mainnet; Chipnet stays one tap away in Settings → Network.
import { beforeEach, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => void store.set(key, value),
  },
}));

beforeEach(() => store.clear());

it('starts on Mainnet when no network was chosen', async () => {
  const { readNetwork } = await import('../../src/wallet/prefs');
  expect(await readNetwork()).toBe('mainnet');
});

it('keeps Chipnet for people who chose it', async () => {
  const { readNetwork, saveNetwork } = await import('../../src/wallet/prefs');
  await saveNetwork('chipnet');
  expect(await readNetwork()).toBe('chipnet');
});

it('treats an unknown saved value as Mainnet', async () => {
  const { readNetwork } = await import('../../src/wallet/prefs');
  store.set('venn.network', 'testnet3');
  expect(await readNetwork()).toBe('mainnet');
});

it('opens a paired wallet on its own network until a network is chosen', async () => {
  const { startingNetwork } = await import('../../src/wallet/connection');
  const paired = (xpub: string) =>
    'wizardconnect:' +
    JSON.stringify({
      privateKey: '11'.repeat(32),
      secret: 'relay-secret',
      walletPublicKey: '02' + '22'.repeat(32),
      walletName: 'Cashonize',
      paths: [{ name: 'receive', xpub }],
    });
  expect(startingNetwork(null, paired('tpubDummy'))).toBe('chipnet');
  expect(startingNetwork(null, paired('xpubDummy'))).toBe('mainnet');
  expect(startingNetwork(null, 'abandon abandon abandon')).toBe('mainnet');
  expect(startingNetwork(null, null)).toBe('mainnet');
  expect(startingNetwork('chipnet', paired('xpubDummy'))).toBe('chipnet');
});

it('reports no choice until the person picks a network', async () => {
  const { readChosenNetwork, saveNetwork } = await import('../../src/wallet/prefs');
  expect(await readChosenNetwork()).toBe(null);
  await saveNetwork('mainnet');
  expect(await readChosenNetwork()).toBe('mainnet');
});
