// The wallet library reaches Mainnet through several checked servers. One that is down or
// misbehaving must not stop balances or pending checks; a broadcast is never sent twice.
import { afterEach, expect, it, vi } from 'vitest';
import { CHECKPOINTS, ElectrumClient, SERVERS } from '../../src/core/electrum';
import { WalletElectrum } from '../../src/wallet/electrum';

const fakeClient = (fail: number) => {
  let failures = fail;
  const calls: string[] = [];
  return {
    calls,
    version: ['Fulcrum 2.1.4', '1.5'],
    next: vi.fn(),
    close: vi.fn(),
    request: vi.fn(async (method: string) => {
      calls.push(method);
      if (failures-- > 0) throw new Error('Connection closed');
      return 'ok';
    }),
  };
};

it('retries a read on the next server once', async () => {
  const client = fakeClient(1);
  const wallet = new WalletElectrum('mainnet', client);
  await expect(wallet.request('blockchain.scripthash.get_history', ['x'])).resolves.toBe('ok');
  expect(client.next).toHaveBeenCalledTimes(1);
  expect(client.calls).toEqual(['blockchain.scripthash.get_history', 'blockchain.scripthash.get_history']);
});

it('answers server.version from the checked connection instead of sending it twice', async () => {
  const client = fakeClient(0);
  const wallet = new WalletElectrum('mainnet', client);
  await expect(wallet.request('server.version', ['react-native-xo', '1.4'])).resolves.toEqual(['Fulcrum 2.1.4', '1.5']);
  expect(client.calls).toEqual(['server.ping']);
});

it('never retries a broadcast', async () => {
  const client = fakeClient(1);
  const wallet = new WalletElectrum('mainnet', client);
  await expect(wallet.request('blockchain.transaction.broadcast', ['00'])).rejects.toThrow('Connection closed');
  expect(client.next).not.toHaveBeenCalled();
  expect(client.calls).toHaveLength(1);
});

it('lists several Mainnet servers', () => {
  expect(SERVERS.mainnet!.length).toBeGreaterThanOrEqual(4);
  expect(new Set(SERVERS.mainnet).size).toBe(SERVERS.mainnet!.length);
  expect(SERVERS.mainnet!.every(url => url.startsWith('wss://'))).toBe(true);
});

// A WebSocket stand-in: the first server refuses, the second answers with the checkpoint header.
const realWebSocket = globalThis.WebSocket;
const realCheckpoint = CHECKPOINTS.mainnet!;
afterEach(() => {
  globalThis.WebSocket = realWebSocket;
  (CHECKPOINTS as Record<string, typeof realCheckpoint>).mainnet = realCheckpoint;
});

it('skips a server that is down and checks the next one against the chain', async () => {
  const header = await checkpointHeader();
  const opened: string[] = [];
  class FakeSocket {
    readyState = 0;
    onopen?: () => void;
    onerror?: () => void;
    onclose?: () => void;
    onmessage?: (event: { data: string }) => void;
    constructor(public url: string) {
      opened.push(url);
      setTimeout(() => {
        if (url === SERVERS.mainnet![0]) return this.onerror?.();
        this.readyState = 1;
        this.onopen?.();
      });
    }
    send(raw: string) {
      const { id, method } = JSON.parse(raw);
      const result = method === 'blockchain.block.header' ? header : method === 'server.version' ? ['Fulcrum', '1.5'] : { height: 1 };
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ id, result }) }));
    }
    close() {
      this.readyState = 3;
    }
  }
  globalThis.WebSocket = FakeSocket as never;
  const client = new ElectrumClient('mainnet', 2_000);
  await expect(client.tipHeight()).resolves.toBe(1);
  expect(opened.slice(0, 2)).toEqual([SERVERS.mainnet![0], SERVERS.mainnet![1]]);
  expect(client.server).toBe(SERVERS.mainnet![1]);
  client.close();
});

it('refuses a server on the wrong chain', async () => {
  class WrongChain {
    readyState = 0;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onerror?: () => void;
    onclose?: () => void;
    constructor() {
      setTimeout(() => {
        this.readyState = 1;
        this.onopen?.();
      });
    }
    send(raw: string) {
      const { id } = JSON.parse(raw);
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ id, result: '00'.repeat(80) }) }));
    }
    close() {}
  }
  globalThis.WebSocket = WrongChain as never;
  const client = new ElectrumClient('mainnet', 2_000);
  await expect(client.tipHeight()).rejects.toThrow('Could not reach the mainnet network');
});

/** A stand-in header, with the checkpoint pointed at it for this test (no network needed). */
async function checkpointHeader() {
  const cp = CHECKPOINTS.mainnet!;
  const fake = '01'.repeat(80);
  const { hash256 } = await import('../../src/core/crypto');
  const { binToHex, hexToBin, reverse } = await import('../../src/core/bytes');
  (CHECKPOINTS as Record<string, { height: number; hash: string }>).mainnet = {
    height: cp.height,
    hash: binToHex(reverse(hash256(hexToBin(fake)))),
  };
  return fake;
}

// A wallet holding many tokens: its balance must still load (seen on Mainnet with 200+ coins).
import { UNSPENT_LIMIT, trimUnspent } from '../../src/wallet/electrum';

const coin = (value: number, token = false) => ({ tx_hash: 'a'.repeat(64), tx_pos: 0, height: 1, value, ...(token ? { token_data: { category: 'c' } } : {}) });

it('leaves token coins out of a coin list that is too long', () => {
  const list = [...Array.from({ length: 200 }, () => coin(800, true)), coin(5_000), coin(90_000)];
  const trimmed = trimUnspent(list);
  expect(trimmed).toHaveLength(2);
  expect(trimmed.every(c => !('token_data' in c))).toBe(true);
});

it('keeps the largest plain coins when even those are too many, and short lists as they are', () => {
  const many = Array.from({ length: 250 }, (_, i) => coin(i + 1));
  const trimmed = trimUnspent(many);
  expect(trimmed).toHaveLength(UNSPENT_LIMIT);
  expect(Math.min(...trimmed.map(c => c.value))).toBe(51);
  const short = [coin(1, true), coin(2)];
  expect(trimUnspent(short)).toBe(short);
});

it('trims listunspent replies passed to the wallet library', async () => {
  const big = [...Array.from({ length: 201 }, () => coin(800, true)), coin(1_000)];
  const client = { version: null, next: vi.fn(), close: vi.fn(), request: vi.fn(async () => big) };
  const wallet = new WalletElectrum('mainnet', client);
  await expect(wallet.request('blockchain.scripthash.listunspent', ['x', 'include_tokens'])).resolves.toHaveLength(1);
  await expect(wallet.request('blockchain.scripthash.get_history', ['x'])).resolves.toHaveLength(202);
});
