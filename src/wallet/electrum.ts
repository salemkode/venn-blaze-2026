// The Electrum connection the wallet library uses. It reaches the network through Venn's own
// client: several Mainnet (and Chipnet) servers, each checked against a chain checkpoint before
// use, so one server being down or behind does not break balances or pending checks.
import { ElectrumClient } from '../core/electrum';
import type { Network } from './prefs';

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
