// QA 21 Nov: plain BCH to a token-aware (z…) address, and a Max that leaves exactly the fee.
import { expect, it } from 'vitest';
import { decodeCashAddress, encodeCashAddress } from '../../src/core/cashaddr';
import { maxSendable, plainAddress } from '../../src/wallet/sendHelpers';

const hash = Uint8Array.from({ length: 20 }, (_, i) => i + 1);
const z = encodeCashAddress('mainnet', 'p2pkh-tokens', hash);
const q = encodeCashAddress('mainnet', 'p2pkh', hash);

it('sends plain BCH for a token-aware address to the same key’s plain address', () => {
  expect(z.startsWith('bitcoincash:z')).toBe(true);
  expect(plainAddress(`  ${z} `, 'mainnet')).toEqual({ address: q, converted: true });
  expect(decodeCashAddress(plainAddress(z, 'mainnet').address).hash).toEqual(hash);
  expect(plainAddress(q, 'mainnet')).toEqual({ address: q, converted: false });
  const rz = encodeCashAddress('mainnet', 'p2sh-tokens', new Uint8Array(32).fill(7));
  expect(plainAddress(rz, 'mainnet')).toEqual({ address: encodeCashAddress('mainnet', 'p2sh', new Uint8Array(32).fill(7)), converted: true });
  // Wrong network or garbage is left for the wallet to explain.
  expect(plainAddress(z, 'chipnet')).toEqual({ address: z, converted: false });
  expect(plainAddress('hello', 'mainnet')).toEqual({ address: 'hello', converted: false });
});

it('Max is the balance less the wallet’s own fee for every coin', () => {
  // One coin of 42,255 sats to a P2PKH address: fee 10 + 148 + 8 + 1 + 25 + 34 = 226 sats (as QA computed).
  expect(maxSendable({ balanceSatoshis: '42255', outputCount: 1 }, q, 'mainnet')).toBe('0.00042029');
  expect(maxSendable({ balanceSatoshis: '100000', outputCount: 3 }, q, 'mainnet')).toBe('0.00099478');
  expect(maxSendable({ balanceSatoshis: '700', outputCount: 1 }, q, 'mainnet')).toBeNull();
  expect(maxSendable(null, q, 'mainnet')).toBeNull();
  expect(maxSendable({ balanceSatoshis: '5000', outputCount: 0 }, q, 'mainnet')).toBeNull();
});
