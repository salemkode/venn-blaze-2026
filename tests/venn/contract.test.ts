import { describe, expect, it } from 'vitest';
import { MONEY, VAULT } from '../../src/venn/artifact';
import { vennCoins } from '../../src/venn/coins';
import { type VennParams, moneyLocking, vennAddress, vennLocking } from '../../src/venn/contract';
import { encodeCardState, encodeRulesState } from '../../src/venn/layout';
import { OFFICIAL } from '../../src/venn/registry';
import { fakeTxid } from '../helpers';
import { sampleCard, sampleRules } from './fixtures';

const vaultCategory = 'ab'.repeat(32);
const bch: VennParams = { network: 'chipnet', vaultCategory };
const token: VennParams = { network: 'chipnet', vaultCategory, assetCategory: 'cd'.repeat(32) };

describe('venn contract', () => {
  it('template is registered', () => {
    const entry = OFFICIAL.find(e => e.sha256 === VAULT.sha256);
    expect(entry).toMatchObject({ name: 'Venn', version: 2, money: MONEY.sha256 });
    expect(OFFICIAL.some(e => e.name === 'Venn' && e.version === 1)).toBe(false);
  });

  it('address depends on asset', () => {
    expect(vennAddress(bch)).not.toBe(vennAddress(token));
    expect(vennAddress(bch).startsWith('bchtest:p')).toBe(true);
  });

  it('vennCoins sorts coins', () => {
    const lockingBytecode = vennLocking(bch);
    const nft = (n: number, capability: 'minting' | 'mutable', commitment: string) => ({
      txid: fakeTxid(n),
      vout: 0,
      value: 1000n,
      height: 10,
      lockingBytecode,
      token: { category: vaultCategory, amount: 0n, nft: { capability, commitment } },
    });
    const coins = vennCoins(bch, [
      nft(1, 'minting', encodeRulesState(sampleRules())),
      nft(2, 'mutable', encodeCardState(sampleCard())),
      nft(3, 'mutable', encodeCardState(sampleCard({ pkh: '22'.repeat(20) }))),
      { txid: fakeTxid(4), vout: 0, value: 5000n, height: 10, lockingBytecode: moneyLocking(bch) },
      {
        txid: fakeTxid(5),
        vout: 0,
        value: 800n,
        height: 10,
        lockingBytecode,
        token: { category: 'ee'.repeat(32), amount: 5n },
      },
    ]);
    expect(coins).not.toBe(null);
    expect(coins!.rules.state.voters).toBe(3);
    expect(coins!.cards.map(c => c.state.pkh)).toEqual(['11'.repeat(20), '22'.repeat(20)]);
    expect(coins!.money.map(m => m.value)).toEqual([5000n]);
  });

  it('vennCoins returns null without rules', () => {
    expect(vennCoins(bch, [])).toBe(null);
  });
});
