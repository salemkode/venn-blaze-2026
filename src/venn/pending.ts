import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { binToHex, hexToBin } from '../core/bytes';
import type { Network } from '../core/cashaddr';
import { NotSent } from '../core/electrum';
import { txidOf, type Transaction } from '../core/tx';
import { broadcast, chain } from './chain';

const key = 'venn.pending.shared.v1';
const schema = z.object({
  network: z.enum(['chipnet', 'mainnet']),
  txid: z.string().regex(/^[0-9a-f]{64}$/),
  /**
   * The coin input 0 spends and its address. Anyone relaying a transaction can reorder
   * parts of its unlocking data and change its txid; once this coin is spent, the pending
   * transaction is settled either way, so the app never waits on a txid that cannot appear.
   */
  lead: z
    .object({ txid: z.string().regex(/^[0-9a-f]{64}$/), vout: z.number().int().min(0), lock: z.string().regex(/^[0-9a-f]+$/) })
    .optional(),
});
let active = false;

export async function readVennPending() {
  const value = await AsyncStorage.getItem(key);
  return value === null ? null : schema.parse(JSON.parse(value));
}

export async function checkVennPending() {
  if (active) throw new Error('Wait for the submission to finish.');
  active = true;
  try {
    const pending = await readVennPending();
    if (!pending) return;
    try {
      await chain(pending.network).transactionHex(pending.txid);
    } catch (error) {
      if (!pending.lead || !(await leadSpent(pending.network, pending.lead))) throw error;
    }
    await AsyncStorage.removeItem(key);
  } finally {
    active = false;
  }
}

async function leadSpent(network: Network, lead: { txid: string; vout: number; lock: string }) {
  const unspent = await chain(network).utxos(hexToBin(lead.lock));
  return !unspent.some(u => u.txid === lead.txid && u.vout === lead.vout);
}

/** `leadLock` is the locking bytecode of the coin input 0 spends. */
export async function sendVennTransaction(tx: Transaction, network: Network, leadLock?: Uint8Array) {
  if (active) throw new Error('A Venn transaction is already in progress.');
  active = true;
  try {
    if (await readVennPending()) throw new Error('Check the pending Venn transaction first.');
    const pending = schema.parse({
      network,
      txid: txidOf(tx),
      ...(leadLock ? { lead: { txid: tx.inputs[0].txid, vout: tx.inputs[0].vout, lock: binToHex(leadLock) } } : {}),
    });
    await AsyncStorage.setItem(key, JSON.stringify(pending));
    try {
      await broadcast(tx, network);
    } catch (error) {
      // This error is emitted only when the client failed to connect before submitting.
      if (error instanceof NotSent) await AsyncStorage.removeItem(key);
      throw error;
    }
    await chain(network).transactionHex(pending.txid);
    await AsyncStorage.removeItem(key);
    return pending.txid;
  } finally {
    active = false;
  }
}
