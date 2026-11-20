// Counts how many of the live run's transactions are confirmed (scripted and on-device).
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { ElectrumClient } from '../../src/core/electrum';

const DEVICE = [
  'c37b95308415a85cd0816f87b516ad0f9f9a69461cd10074228680eaa69a93a4', 'e68d845006cc4488899871849dc4d5b5a09cd0d228328b54a0efce5f694581ce',
  '9bd63b02a2c96a5dd67b03227df7d27087ff998142286747e5a959b406c6288a', '63e73e61b34093f6690d0dee377dba6892874f18369162dcb141b5e4a19342bf',
  '632340063d9faa46856abc4abe0dcffde6804fb1aefd3cf70ccd7d0227fa2834', '10fa0a5e2ea7e521b701a9dc53b2821adce68bdabf9c7830960f79c02650b291',
  'f464fc58723e4c1863a7640db6f03a4e096f6d9915d53ddd5c1fc3de0c1502e3', '0d117273316003d3cc2951993fee9e088e162d7911e9bee690d44e7fb131fcca',
  '4a040ff59bf3d983899421441c69f2f043791b99f6d0b97873195959869cb40c', '327937016f413d699646c5666f07e9cbcde1a63f7d9b641d25c83345a1aa4acb',
];

it.skipIf(Boolean(process.env.MAINNET))('confirmations', async () => {
  const c = new ElectrumClient('chipnet');
  const s = JSON.parse(readFileSync(new URL('../../artifacts/live-v2/state.json', import.meta.url), 'utf8'));
  const ids: string[] = [...s.log.map((l: { txid: string }) => l.txid), ...DEVICE];
  let confirmed = 0;
  const waiting: string[] = [];
  for (const id of ids) {
    if (((await c.status(id)) ?? 0) > 0) confirmed++;
    else waiting.push(id.slice(0, 8));
  }
  process.stdout.write(`CONFIRMED ${confirmed}/${ids.length} tip=${await c.tipHeight()} waiting=${waiting.join(',')}\n`);
  c.close();
});
