// The Electrum connection the wallet library uses. It reaches the network through Venn's own
// client: several Mainnet (and Chipnet) servers, each checked against a chain checkpoint before
// use, so one server being down or behind does not break balances or pending checks.
import { ElectrumClient } from '../core/electrum';
import type { Network } from './prefs';

/** The wallet library refuses a coin list longer than this. */
export const UNSPENT_LIMIT = 200;

type Unspent = { value: number; token_data?: unknown };

/**
 * A wallet with many tokens (say two collections of 100 NFTs) can hold more coins on one address
 * than the library accepts, and then its balance never loads. The web wallet pays in plain BCH
 * only, so coins carrying tokens are left out; if plain coins alone are still too many, the
 * largest are kept.
 */
export function trimUnspent<T extends Unspent>(list: T[]): T[] {
  if (list.length <= UNSPENT_LIMIT) return list;
  const plain = list.filter(coin => coin.token_data === undefined || coin.token_data === null);
  return plain.length <= UNSPENT_LIMIT ? plain : [...plain].sort((a, b) => b.value - a.value).slice(0, UNSPENT_LIMIT);
}

/** A broadcast that failed midway may still have reached the network, so it is never retried. */
const NOT_RETRIED = new Set(['blockchain.transaction.broadcast']);

interface Client {
  version: unknown;
  request(method: string, params: unknown[]): Promise<unknown>;
  next(): void;
  close(): void;
}

export class WalletElectrum {
  private closed = false;

  constructor(
    network: Network,
    private readonly client: Client = new ElectrumClient(network),
  ) {}

  async request(method: string, params: unknown[] = []): Promise<unknown> {
    const result = await this.send(method, params);
    return method === 'blockchain.scripthash.listunspent' && Array.isArray(result) ? trimUnspent(result as Unspent[]) : result;
  }

  private async send(method: string, params: unknown[]): Promise<unknown> {
    // Servers accept server.version once per connection, and the connection already sent it while
    // checking the chain. Make sure a checked connection is up and repeat its answer.
    if (method === 'server.version') {
      await this.request('server.ping', []);
      return this.client.version;
    }
    try {
      return await this.client.request(method, params);
    } catch (error) {
      if (this.closed || NOT_RETRIED.has(method)) throw error;
      // Read-only: try once more on the next server.
      this.client.next();
      return this.client.request(method, params);
    }
  }

  close() {
    this.closed = true;
    this.client.close();
  }
}
