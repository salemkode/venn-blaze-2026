// Recent transactions of a wallet with their net amounts: one address for a wallet on this
// device, or every used address of a connected wallet's shared branches. Read-only; every
// transaction the server returns is checked against its ID before it is used.
import {
  binToHex,
  cashAddressToLockingBytecode,
  decodeHdPublicKey,
  decodeTransaction,
  deriveHdPathRelative,
  hashTransaction,
  hexToBin,
  lockingBytecodeToCashAddress,
  publicKeyToP2pkhLockingBytecode,
} from '@bitauth/libauth';
import type { Transaction } from '@bitauth/libauth';
import { ElectrumClient } from 'react-native-xo/electrum';
import { z } from 'zod';

export const HISTORY_LIMIT = 25;
const MAX_FETCHES = 120;
/** Unused addresses in a row that end the scan of a branch, and a hard stop per branch. */
const GAP = 5;
const MAX_INDEX = 200;
const BRANCHES = ['receive', 'change'];

/** A connected wallet's shared branch key, as WizardConnect delivers it. */
export interface Branch {
  name: string;
  xpub: string;
}
type Prefix = 'bitcoincash' | 'bchtest' | 'bchreg';
interface Requester {
  request(method: string, params: unknown[]): Promise<unknown>;
}

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

/** Satoshis this transaction moved in or out of the wallet's locking bytecodes. */
export function netAmount(transaction: Transaction, lockingBytecode: string | Set<string>, parents: Map<string, Transaction>) {
  const mine = typeof lockingBytecode === 'string' ? new Set([lockingBytecode]) : lockingBytecode;
  const ours = (output: { lockingBytecode: Uint8Array }) => mine.has(binToHex(output.lockingBytecode));
  let delta = 0n;
  for (const output of transaction.outputs) if (ours(output)) delta += output.valueSatoshis;
  for (const input of transaction.inputs) {
    const spent = parents.get(binToHex(input.outpointTransactionHash))?.outputs[input.outpointIndex];
    if (spent && ours(spent)) delta -= spent.valueSatoshis;
  }
  return delta.toString();
}

export async function fetchHistory(address: string, endpoint: string, branches: Branch[] = []): Promise<HistoryItem[]> {
  const client = new ElectrumClient(endpoint);
  try {
    return await historyFor(client, address, address.split(':')[0] as Prefix, branches);
  } finally {
    client.close();
  }
}

/** Every address of `branches` up to the first GAP unused ones in a row, with its history. */
async function scanBranches(client: Requester, prefix: Prefix, branches: Branch[]) {
  const found: { address: string; history: z.infer<typeof entries> }[] = [];
  for (const branch of branches.filter(b => BRANCHES.includes(b.name))) {
    const decoded = decodeHdPublicKey(branch.xpub);
    if (typeof decoded === 'string') throw new Error(`The connected wallet shared an invalid ${branch.name} key.`);
    for (let index = 0, gap = 0; gap < GAP && index < MAX_INDEX; index++) {
      const child = deriveHdPathRelative(decoded.node, String(index));
      if (typeof child === 'string') throw new Error(child);
      const encoded = lockingBytecodeToCashAddress({ bytecode: publicKeyToP2pkhLockingBytecode({ publicKey: child.publicKey }), prefix });
      if (typeof encoded === 'string') throw new Error(encoded);
      const history = entries.parse(await client.request('blockchain.address.get_history', [encoded.address]));
      gap = history.length ? 0 : gap + 1;
      if (history.length) found.push({ address: encoded.address, history });
    }
  }
  return found;
}

export async function historyFor(client: Requester, address: string, prefix: Prefix, branches: Branch[] = []) {
  const watched = new Map<string, z.infer<typeof entries>>();
  watched.set(address, entries.parse(await client.request('blockchain.address.get_history', [address])));
  for (const { address: other, history } of await scanBranches(client, prefix, branches)) watched.set(other, history);
  const mine = new Set<string>();
  for (const each of watched.keys()) {
    const locking = cashAddressToLockingBytecode(each);
    if (typeof locking === 'string') throw new Error('Invalid CashAddress.');
    mine.add(binToHex(locking.bytecode));
  }
  // One entry per transaction across all addresses; a confirmed height wins over the mempool.
  const byId = new Map<string, z.infer<typeof entries>[number]>();
  for (const item of [...watched.values()].flat()) {
    const seen = byId.get(item.tx_hash);
    if (!seen || (item.height > 0 && seen.height <= 0)) byId.set(item.tx_hash, item);
  }
  const all = [...byId.values()];
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
  return Promise.all(
    newestFirst(all)
      .slice(0, HISTORY_LIMIT)
      .map(async (item): Promise<HistoryItem> => {
        const base = { txid: item.tx_hash, pending: item.height <= 0 };
        const record = await load(item.tx_hash);
        if (!record) return { ...base, time: null };
        // Anything the wallet spends was received in its own history.
        const spends = [
          ...new Set(
            record.transaction.inputs.map(i => binToHex(i.outpointTransactionHash)).filter(id => known.has(id)),
          ),
        ];
        const parents = await Promise.all(spends.map(load));
        if (!parents.every(Boolean)) return { ...base, time: record.time };
        const map = new Map(spends.map((id, n) => [id, parents[n]!.transaction]));
        return { ...base, time: record.time, delta: netAmount(record.transaction, mine, map) };
      }),
  );
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
