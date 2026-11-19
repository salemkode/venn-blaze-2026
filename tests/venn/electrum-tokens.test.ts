import { expect, it, vi } from 'vitest';
import { ElectrumClient, scriptHash } from '../../src/core/electrum';
import { p2pkhForPublicKey } from '../../src/core/draft';
import { VENN_TEST_USD } from '../../src/venn/asset';
import { people } from './fixtures';

it('requests both BCH and CashToken outputs from a Chipnet peer', async () => {
  const client = new ElectrumClient('chipnet');
  const locking = p2pkhForPublicKey(people.creator.publicKey);
  const request = vi.spyOn(client, 'request').mockResolvedValue([{
    height: 0, tx_hash: '11'.repeat(32), tx_pos: 0, value: 1000,
    token_data: { category: VENN_TEST_USD.category, amount: '2500' },
  }]);
  const [coin] = await client.utxos(locking);
  expect(request).toHaveBeenCalledWith('blockchain.scripthash.listunspent', [scriptHash(locking), 'include_tokens']);
  expect(coin.token).toEqual({ category: VENN_TEST_USD.category, amount: 2500n });
});
