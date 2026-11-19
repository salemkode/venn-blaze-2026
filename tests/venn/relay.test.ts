// Every broadcast also reaches every other Chipnet server, whichever one the client used.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent: string[] = [];
let primaryServer = '';

vi.mock('../../src/core/electrum', () => {
  class ElectrumClient {
    server: string;
    constructor(_network: string, _timeout?: number, only?: string) {
      this.server = only ?? primaryServer;
    }
    async broadcast(_raw: string, txid: string) {
      sent.push(this.server);
      return txid;
    }
    close() {}
  }
  return {
    ElectrumClient,
    SERVERS: { chipnet: ['wss://one', 'wss://two', 'wss://three'] },
    scriptHash: () => '',
    NotSent: class extends Error {},
  };
});

const tx = { version: 2, locktime: 0, inputs: [], outputs: [] };

describe('broadcast relay', () => {
  beforeEach(() => {
    sent.length = 0;
    vi.resetModules();
  });

  for (const primary of ['wss://one', 'wss://two', 'wss://three']) {
    it(`reaches every server when the client is on ${primary}`, async () => {
      primaryServer = primary;
      const { broadcast } = await import('../../src/venn/chain');
      await broadcast(tx);
      await new Promise(r => setTimeout(r, 0));
      expect(sent[0]).toBe(primary);
      expect([...sent].sort()).toEqual(['wss://one', 'wss://three', 'wss://two']);
    });
  }
});
