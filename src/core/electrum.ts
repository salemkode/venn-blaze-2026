// Minimal Electrum (Fulcrum) client over WebSocket. Works in React Native and Node.
import type { Utxo } from './draft';
import { type Bytes, binToHex, hexToBin, reverse } from './bytes';
import type { Network } from './cashaddr';
import { hash256, sha256 } from './crypto';
import { type Capability, decodeTransaction } from './tx';

/**
 * Fulcrum servers per network. Mainnet servers are run by four different operators; every
 * broadcast goes to all of them (see venn/chain.ts), so one server that does not relay cannot
 * strand a transaction.
 */
export const SERVERS: Partial<Record<Network, string[]>> = {
  chipnet: ['wss://chipnet.bch.ninja:50004', 'wss://chipnet.imaginary.cash:50004'],
  mainnet: [
    'wss://bch.imaginary.cash:50004',
    'wss://fulcrum.greyh.at:50004',
    'wss://blackie.c3-soft.com:50004',
    'wss://bch.soul-dev.com:50004',
  ],
};

/**
 * Header hash that proves the server follows the right chain. Chipnet (not testnet3/testnet4):
 * read from two independent Chipnet servers on 2026-11-16; the same servers match the BCHN Chipnet
 * anchor at height 121957. Mainnet: block 900000, identical on all four mainnet servers above on
 * 2026-11-19.
 */
export const CHECKPOINTS: Partial<Record<Network, { height: number; hash: string }>> = {
  chipnet: { height: 300000, hash: '00000000142fbee39fa4ba154cd61677beb9d446cfd43fe80fda4e1579f5d06a' },
  mainnet: { height: 900000, hash: '000000000000000000ff9445c5039fd67d02e901b3cefe8bd55c1d6afb5fe1cf' },
};

export const scriptHash = (lockingBytecode: Bytes): string => binToHex(reverse(sha256(lockingBytecode)));

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

/** We could not even reach a server, so nothing was sent. */
export class NotSent extends Error {
  constructor(reason: string) {
    super(`Could not reach the network, so nothing was sent. ${reason}`.trim());
  }
}

export class AmbiguousBroadcast extends Error {
  constructor(public txid: string) {
    super(
      'The network did not answer in time. The payment may or may not have been sent. Check its status before trying again.',
    );
  }
}

export class ElectrumClient {
  private ws?: WebSocket;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private connecting?: Promise<void>;
  private serverIndex = 0;
  public server = '';

  constructor(private network: Network, private timeoutMs = 15_000, private only?: string) {
    if (!SERVERS[network] || !CHECKPOINTS[network]) throw new Error(`${network} is not supported in this release`);
  }

  /**
   * Proves a transaction is in a block: the Merkle branch from the server must lead to the
   * Merkle root in that block's header. Returns the block hash, or null while unconfirmed.
   */
  async inclusion(txid: string): Promise<string | null> {
    const tip = await this.tipHeight();
    const verbose = await this.request('blockchain.transaction.get', [txid, true]);
    const confs: number = verbose?.confirmations ?? 0;
    if (confs <= 0) return null;
    const height = tip - confs + 1;
    const proof: { merkle: string[]; pos: number } = await this.request('blockchain.transaction.get_merkle', [
      txid,
      height,
    ]);
    const header: string = await this.request('blockchain.block.header', [height]);
    let h = reverse(hexToBin(txid));
    let pos = proof.pos;
    for (const branch of proof.merkle) {
      const b = reverse(hexToBin(branch));
      h = pos & 1 ? hash256(new Uint8Array([...b, ...h])) : hash256(new Uint8Array([...h, ...b]));
      pos >>= 1;
    }
    const root = hexToBin(header.slice(72, 136));
    if (binToHex(h) !== binToHex(root)) throw new Error('The server’s inclusion proof is wrong');
    return binToHex(reverse(hash256(hexToBin(header))));
  }

  private async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === 1) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const servers = this.only ? [this.only] : SERVERS[this.network]!;
      let lastError: unknown;
      for (let attempt = 0; attempt < servers.length; attempt++) {
        const url = servers[(this.serverIndex + attempt) % servers.length];
        try {
          await this.open(url);
          await this.verifyChain();
          this.serverIndex = (this.serverIndex + attempt) % servers.length;
          this.server = url;
          return;
        } catch (e) {
          lastError = e;
          this.close();
        }
      }
      throw new Error(
        `Could not reach the ${this.network} network. ${lastError instanceof Error ? lastError.message : ''}`.trim(),
      );
    })();
    try {
      await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  private open(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('Connection timed out'));
      }, this.timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        this.ws = ws;
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Connection failed'));
      };
      ws.onclose = () => {
        if (this.ws === ws) this.ws = undefined;
        for (const [, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(new Error('Connection closed'));
        }
        this.pending.clear();
      };
      ws.onmessage = event => {
        let msg: any;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const p = msg?.id !== undefined ? this.pending.get(msg.id) : undefined;
        if (!p) return;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error)
          p.reject(new Error(typeof msg.error === 'string' ? msg.error : msg.error.message ?? 'Server error'));
        else p.resolve(msg.result);
      };
    });
  }

  private async verifyChain() {
    await this.raw('server.version', ['FamilyVault 1.0', '1.5']);
    const cp = CHECKPOINTS[this.network]!;
    const header: string = await this.raw('blockchain.block.header', [cp.height]);
    const hash = binToHex(reverse(hash256(hexToBin(header))));
    if (hash !== cp.hash) throw new Error(`Server is not on ${this.network}`);
  }

  private raw(method: string, params: unknown[]): Promise<any> {
    const ws = this.ws;
    if (!ws) return Promise.reject(new Error('Not connected'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new TimeoutError(method));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  async request(method: string, params: unknown[]): Promise<any> {
    await this.connect();
    return this.raw(method, params);
  }

  close() {
    this.ws?.close();
    this.ws = undefined;
  }

  async tipHeight(): Promise<number> {
    const tip = await this.request('blockchain.headers.subscribe', []);
    return tip.height;
  }

  private mtpCache = new Map<number, number>();

  /** Median time past of the block at `height` (median timestamp of it and the 10 before). */
  async medianTimePast(height: number): Promise<number> {
    const cached = this.mtpCache.get(height);
    if (cached !== undefined) return cached;
    const start = Math.max(0, height - 10);
    const res = await this.request('blockchain.block.headers', [start, height - start + 1]);
    const hex: string = res.hex;
    const times: number[] = [];
    for (let i = 0; i < hex.length / 160; i++) {
      const b = hexToBin(hex.slice(i * 160 + 136, i * 160 + 144));
      times.push(b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] * 2 ** 24));
    }
    times.sort((a, b) => a - b);
    const mtp = times[Math.floor(times.length / 2)];
    if (this.mtpCache.size > 200) this.mtpCache.clear();
    this.mtpCache.set(height, mtp);
    return mtp;
  }

  /**
   * Seconds of median time past since a coin confirmed, as BIP68 time locks measure it for
   * the next block: MTP(tip) − MTP(block before the coin's block). 0 while unconfirmed.
   */
  async lockElapsed(coinHeight: number, tipHeight: number): Promise<number> {
    if (coinHeight <= 0) return 0;
    return Math.max(0, (await this.medianTimePast(tipHeight)) - (await this.medianTimePast(coinHeight - 1)));
  }

  async utxos(lockingBytecode: Bytes): Promise<Utxo[]> {
    const list: any[] = await this.request('blockchain.scripthash.listunspent', [scriptHash(lockingBytecode), 'include_tokens']);
    return list.map(u => {
      const t = u.token_data;
      return {
        txid: u.tx_hash,
        vout: u.tx_pos,
        value: BigInt(u.value),
        height: u.height > 0 ? u.height : 0,
        lockingBytecode,
        ...(t
          ? {
              token: {
                category: t.category,
                amount: BigInt(t.amount ?? 0),
                ...(t.nft
                  ? { nft: { capability: t.nft.capability as Capability, commitment: t.nft.commitment ?? '' } }
                  : {}),
              },
            }
          : {}),
      };
    });
  }

  /** Broadcasts once. A timeout is reported as ambiguous and must never be retried blindly. */
  async broadcast(rawHex: string, txid: string): Promise<string> {
    try {
      await this.connect();
    } catch (e) {
      throw new NotSent(e instanceof Error ? e.message : '');
    }
    let result: string;
    try {
      result = await this.raw('blockchain.transaction.broadcast', [rawHex]);
    } catch (e) {
      if (e instanceof TimeoutError || (e instanceof Error && /Connection closed|Not connected/.test(e.message)))
        throw new AmbiguousBroadcast(txid);
      // The network already has it: that is success, not a failure.
      if (e instanceof Error && /already (in|known)|txn-already|transaction already in block chain/i.test(e.message))
        return txid;
      throw e;
    }
    if (result !== txid) throw new AmbiguousBroadcast(txid);
    return result;
  }

  /** Returns confirmations, 0 for mempool, or null when the network does not know the transaction. */
  async status(txid: string): Promise<number | null> {
    try {
      const tx = await this.request('blockchain.transaction.get', [txid, true]);
      return typeof tx?.confirmations === 'number' ? tx.confirmations : 0;
    } catch (e) {
      if (e instanceof Error && /not found|No such|unknown/i.test(e.message)) return null;
      throw e;
    }
  }

  private txCache = new Map<string, string>();

  async transactionHex(txid: string): Promise<string> {
    const cached = this.txCache.get(txid);
    if (cached) return cached;
    const hex: string = await this.request('blockchain.transaction.get', [txid, false]);
    // Never trust bytes the server labels with a txid: they must hash to that txid.
    if (typeof hex !== 'string' || binToHex(reverse(hash256(hexToBin(hex)))) !== txid)
      throw new Error('The server returned a wrong transaction');
    if (this.txCache.size > 500) this.txCache.clear();
    this.txCache.set(txid, hex);
    return hex;
  }

  private timeCache = new Map<number, number>();

  /** Block timestamp (seconds) at a height. */
  async blockTime(height: number): Promise<number> {
    const cached = this.timeCache.get(height);
    if (cached !== undefined) return cached;
    const header: string = await this.request('blockchain.block.header', [height]);
    const b = hexToBin(header.slice(136, 144));
    const t = b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] * 2 ** 24);
    this.timeCache.set(height, t);
    return t;
  }

  /**
   * Recent transactions touching an address with the net change for it. Coins spent from the
   * address always come from earlier transactions in the same history, so no other lookups
   * are needed.
   */
  async history(lockingBytecode: Bytes, limit = 20): Promise<HistoryItem[]> {
    const list: { tx_hash: string; height: number }[] = await this.request('blockchain.scripthash.get_history', [
      scriptHash(lockingBytecode),
    ]);
    const ours = new Set(list.map(h => h.tx_hash));
    const recent = [...list]
      .sort((a, b) => (a.height <= 0 ? 1e12 : a.height) - (b.height <= 0 ? 1e12 : b.height))
      .slice(-limit)
      .reverse();
    const key = binToHex(lockingBytecode);
    const items: HistoryItem[] = [];
    for (const h of recent) {
      const tx = decodeTransaction(hexToBin(await this.transactionHex(h.tx_hash)));
      let delta = 0n;
      for (const o of tx.outputs) if (binToHex(o.lockingBytecode) === key) delta += o.value;
      for (const i of tx.inputs) {
        if (!ours.has(i.txid)) continue;
        const prev = decodeTransaction(hexToBin(await this.transactionHex(i.txid))).outputs[i.vout];
        if (prev && binToHex(prev.lockingBytecode) === key) delta -= prev.value;
      }
      items.push({
        txid: h.tx_hash,
        height: h.height > 0 ? h.height : 0,
        delta,
        time: h.height > 0 ? await this.blockTime(h.height) : undefined,
      });
    }
    return items;
  }
}

export interface HistoryItem {
  txid: string;
  height: number;
  /** Net change for the address, in satoshis. */
  delta: bigint;
  /** Block time in seconds; undefined while unconfirmed. */
  time?: number;
}

export class TimeoutError extends Error {
  constructor(method: string) {
    super(`${method} timed out`);
  }
}
