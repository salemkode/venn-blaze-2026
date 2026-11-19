import { expect, it } from 'vitest';
import type { PendingRecord } from 'react-native-xo/core';
import { offlineWallet } from '../fixtures/xo/offline-wallet.js';

it('prepares a verified Mainnet payment and rejects a Chipnet recipient', async () => {
  const mainnet = offlineWallet({ network: 'mainnet' });
  const chipnet = offlineWallet();
  try {
    expect(mainnet.wallet.address).toMatch(/^bitcoincash:/);
    mainnet.fund();
    await expect(mainnet.wallet.prepareSend({ address: chipnet.wallet.address, amountBch: '0.001' }))
      .rejects.toThrow(/address|network/i);
    const review = await mainnet.wallet.prepareSend({ address: mainnet.wallet.address, amountBch: '0.001' });
    expect(review).toMatchObject({ network: 'mainnet', address: mainnet.wallet.address, amountBch: '0.00100000' });
    expect(BigInt(review.feeSatoshis)).toBeGreaterThan(0n);
    expect(mainnet.state.broadcasts).toBe(0);
  } finally {
    mainnet.wallet.close();
    chipnet.wallet.close();
  }
});

it('reviews a real VM-verified payment and persists its record before the synthetic broadcast', async () => {
  const { wallet, state, fund } = offlineWallet();
  try {
    fund();
    const review = await wallet.prepareSend({ address: wallet.address, amountBch: '0.001' });
    expect(review).toMatchObject({ network: 'chipnet', address: wallet.address, amountBch: '0.00100000' });
    expect(BigInt(review.feeSatoshis)).toBeGreaterThan(0n);
    let persisted = false;
    await wallet.broadcast(review.id, { persistPending: async record => {
      expect(state.broadcasts).toBe(0);
      expect(record.txid).toBe(review.txid);
      persisted = true;
    } });
    expect(persisted).toBe(true);
    expect(state.broadcasts).toBe(1);
    await expect(wallet.broadcast(review.id)).rejects.toThrow();
    expect(state.broadcasts).toBe(1);
  } finally { wallet.close(); }
});

it('retains an ambiguous payment across session restoration and blocks another send', async () => {
  const original = offlineWallet({ uncertain: true });
  const restored = offlineWallet();
  try {
    original.fund();
    const review = await original.wallet.prepareSend({ address: original.wallet.address, amountBch: '0.001' });
    const saved: PendingRecord[] = [];
    await expect(original.wallet.broadcast(review.id, { persistPending: record => {
      saved.push(record);
    } })).rejects.toMatchObject({ name: 'BroadcastUncertainError' });
    expect(original.state.broadcasts).toBe(1);
    const [record] = saved;
    expect(record?.txid).toBe(review.txid);
    restored.wallet.restorePending(record);
    await expect(restored.wallet.prepareSend({ address: restored.wallet.address, amountBch: '0.001' })).rejects.toThrow(/pending|resolve|check/i);
    expect(restored.state.broadcasts).toBe(0);
  } finally { original.wallet.close(); restored.wallet.close(); }
});

it('refuses malformed RPC collections instead of accepting invalid outputs', async () => {
  const { wallet, state, client } = offlineWallet();
  const request = client.request;
  client.request = async (method, params) => method === 'blockchain.scripthash.listunspent'
    ? [{ tx_hash: 'invalid', tx_pos: -1, value: -1, height: 0 }]
    : request(method, params);
  try {
    await expect(wallet.refresh()).rejects.toThrow();
    expect(state.broadcasts).toBe(0);
  } finally { wallet.close(); }
});
