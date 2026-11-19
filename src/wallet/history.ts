// Recent transactions of one address with their net amounts. Read-only; every
// transaction the server returns is checked against its ID before it is used.
import { binToHex, cashAddressToLockingBytecode, decodeTransaction, hashTransaction, hexToBin } from '@bitauth/libauth';
import type { Transaction } from '@bitauth/libauth';
import { ElectrumClient } from 'react-native-xo/electrum';
import { z } from 'zod';

export const HISTORY_LIMIT = 25;
const MAX_FETCHES = 120;

export interface HistoryItem {
  txid: string;
  pending: boolean;
  time: number | null;
  /** Net satoshis for the address; absent when a parent could not be loaded. */
  delta?: string;
}

const hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const entries = z.array(z.object({ tx_hash: hex64, height: z.number().int() }).passthrough()).max(50000);
const verbose = z
  .object({ hex: z.string().regex(/^([0-9a-f]{2})+$/), blocktime: z.number().int().positive().optional() })
  .passthrough();

const confirmed = new Map<string, { transaction: Transaction; time: number | null }>();

export function newestFirst<T extends { height: number; tx_hash: string }>(list: T[]) {
  const rank = (item: T) => (item.height > 0 ? item.height : Infinity);
  return [...list].sort((a, b) => rank(b) - rank(a) || a.tx_hash.localeCompare(b.tx_hash));
}

export function parseTransaction(txid: string, raw: string) {
  const bytes = hexToBin(raw);
  if (hashTransaction(bytes) !== txid) throw new Error('History returned a transaction with the wrong ID.');
  const decoded = decodeTransaction(bytes);
  if (typeof decoded === 'string') throw new Error('History returned an unreadable transaction.');
  return decoded;
}

/** Satoshis this transaction moved in or out of `lockingBytecode`. */
export function netAmount(transaction: Transaction, lockingBytecode: string, parents: Map<string, Transaction>) {
  const ours = (output: { lockingBytecode: Uint8Array }) => binToHex(output.lockingBytecode) === lockingBytecode;
  let delta = 0n;
  for (const output of transaction.outputs) if (ours(output)) delta += output.valueSatoshis;
  for (const input of transaction.inputs) {
    const spent = parents.get(binToHex(input.outpointTransactionHash))?.outputs[input.outpointIndex];
    if (spent && ours(spent)) delta -= spent.valueSatoshis;
  }
  return delta.toString();
}

export async function fetchHistory(address: string, endpoint: string): Promise<HistoryItem[]> {
  const locking = cashAddressToLockingBytecode(address);
  if (typeof locking === 'string') throw new Error('Invalid CashAddress.');
  const lockingBytecode = binToHex(locking.bytecode);
  const client = new ElectrumClient(endpoint);
  try {
    const all = entries.parse(await client.request('blockchain.address.get_history', [address]));
    const known = new Set(all.map(item => item.tx_hash));
    const loaded = new Map<string, Promise<{ transaction: Transaction; time: number | null } | null>>();
    let fetches = 0;
    const load = (txid: string) => {
      if (!loaded.has(txid))
        loaded.set(
          txid,
          (async () => {
            if (confirmed.has(txid)) return confirmed.get(txid)!;
            if (++fetches > MAX_FETCHES) return null;
            const answer = verbose.parse(await client.request('blockchain.transaction.get', [txid, true]));
            const record = { transaction: parseTransaction(txid, answer.hex), time: answer.blocktime ?? null };
            if (record.time) confirmed.set(txid, record);
            return record;
          })(),
        );
      return loaded.get(txid)!;
    };
    return await Promise.all(
      newestFirst(all)
        .slice(0, HISTORY_LIMIT)
        .map(async item => {
          const base = { txid: item.tx_hash, pending: item.height <= 0 };
          const record = await load(item.tx_hash);
          if (!record) return { ...base, time: null };
          // Anything this address spends was received in its own history.
          const spends = [
            ...new Set(
              record.transaction.inputs.map(i => binToHex(i.outpointTransactionHash)).filter(id => known.has(id)),
            ),
          ];
          const parents = await Promise.all(spends.map(load));
          if (!parents.every(Boolean)) return { ...base, time: record.time };
          const map = new Map(spends.map((id, n) => [id, parents[n]!.transaction]));
          return { ...base, time: record.time, delta: netAmount(record.transaction, lockingBytecode, map) };
        }),
    );
  } finally {
    client.close();
  }
}

export function dayLabel(time: number | null, now = Date.now()) {
  if (!time) return 'Pending';
  const day = (value: number) => {
    const d = new Date(value);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((day(now) - day(time * 1000)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(time * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
