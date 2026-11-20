// Every broadcast also reaches every other server of its network, whichever one the client used.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent: string[] = [];
let primaryServer = '';

vi.mock('../../src/core/electrum', () => {
  class ElectrumClient {
    server: string;
    constructor(network: string, _timeout?: number, only?: string) {
      this.server = only ?? (network === 'mainnet' ? 'wss://main-one' : primaryServer);
    }
    async broadcast(_raw: string, txid: string) {
      sent.push(this.server);
      return txid;
    }
    close() {}
  }
  return {
    ElectrumClient,
    SERVERS: { chipnet: ['wss://one', 'wss://two', 'wss://three'], mainnet: ['wss://main-one', 'wss://main-two'] },
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
      await broadcast(tx, 'chipnet');
      await new Promise(r => setTimeout(r, 0));
      expect(sent[0]).toBe(primary);
      expect([...sent].sort()).toEqual(['wss://one', 'wss://three', 'wss://two']);
    });
  }

  it('keeps a Mainnet broadcast on Mainnet servers', async () => {
    const { broadcast } = await import('../../src/venn/chain');
    await broadcast(tx, 'mainnet');
    await new Promise(r => setTimeout(r, 0));
    expect([...sent].sort()).toEqual(['wss://main-one', 'wss://main-two']);
  });
});
