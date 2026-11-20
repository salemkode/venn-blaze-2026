import { expect, it, vi } from 'vitest';
import { txidOf } from '../../src/core/tx';
import { checkVennPending, readVennPending, sendVennTransaction } from '../../src/venn/pending';
import { fakeTxid } from '../helpers';

const state = vi.hoisted(() => ({
  records: new Map<string, string>(),
  broadcast: vi.fn(),
  transactionHex: vi.fn(),
  networks: [] as string[],
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => state.records.get(key) ?? null,
    setItem: async (key: string, value: string) => { state.records.set(key, value); },
    removeItem: async (key: string) => { state.records.delete(key); },
  },
}));

vi.mock('../../src/venn/chain', () => ({
  broadcast: state.broadcast,
  chain: (network: string) => {
    state.networks.push(network);
    return { transactionHex: state.transactionHex };
  },
}));

it('persists before broadcast and blocks another Venn submission until the original is visible', async () => {
  const tx = {
    version: 2,
    locktime: 0,
    inputs: [{ txid: fakeTxid(1), vout: 0, sequence: 0, unlockingBytecode: new Uint8Array() }],
    outputs: [{ value: 546n, lockingBytecode: Uint8Array.of(0x51) }],
  };
  const txid = txidOf(tx);
  state.broadcast.mockImplementationOnce(async () => {
    expect(await readVennPending()).toEqual({ network: 'chipnet', txid });
    throw new Error('Connection closed');
  });
  await expect(sendVennTransaction(tx, 'chipnet')).rejects.toThrow('Connection closed');
  await expect(sendVennTransaction(tx, 'chipnet')).rejects.toThrow('Check the pending Venn transaction first');
  expect(state.broadcast).toHaveBeenCalledTimes(1);

  state.transactionHex.mockRejectedValueOnce(new Error('Transaction not found'));
  await expect(checkVennPending()).rejects.toThrow('Transaction not found');
  expect((await readVennPending())?.txid).toBe(txid);

  state.transactionHex.mockResolvedValueOnce('verified source bytes');
  await checkVennPending();
  expect(await readVennPending()).toBeNull();
});

it('records the network and checks a Mainnet transaction on Mainnet', async () => {
  const tx = {
    version: 2,
    locktime: 0,
    inputs: [{ txid: fakeTxid(2), vout: 0, sequence: 0, unlockingBytecode: new Uint8Array() }],
    outputs: [{ value: 546n, lockingBytecode: Uint8Array.of(0x51) }],
  };
  state.networks.length = 0;
  state.broadcast.mockImplementationOnce(async (_tx: unknown, network: string) => {
    expect(network).toBe('mainnet');
    expect((await readVennPending())?.network).toBe('mainnet');
    throw new Error('Connection closed');
  });
  await expect(sendVennTransaction(tx, 'mainnet')).rejects.toThrow('Connection closed');
  state.transactionHex.mockResolvedValueOnce('verified source bytes');
  await checkVennPending();
  expect(state.networks).toEqual(['mainnet']);
  expect(await readVennPending()).toBeNull();
});
