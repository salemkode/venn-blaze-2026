import { decodeCashAddress, lockingBytecodeForAddress } from '../core/cashaddr';

export const VENN_TEST_USD = {
  network: 'chipnet',
  category: '4514d3386913330eb7ebdb76187e8c2029b6f1a9556d5a22328e6b099591507e',
  genesisTxid: '62ff26f21a943093e40485d7fb3c885946eabb9aac922011a49f8a0dfa8fea43',
  symbol: 'Venn Test USD',
  decimals: 2,
} as const;

export const VENN_FEE_ALLOCATION = 25_000n;
const cents = 10n ** BigInt(VENN_TEST_USD.decimals);
const maximum = (1n << 63n) - 1n;

export const formatTestUsd = (amount: bigint) =>
  `${amount / cents}.${String(amount % cents).padStart(VENN_TEST_USD.decimals, '0')}`;

export function parseTestUsd(input: string) {
  const value = input.trim();
  if (!/^\d{1,17}(\.\d{0,2})?$/.test(value)) throw new Error('Enter Venn Test USD to the nearest cent.');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * cents + BigInt(fraction.padEnd(VENN_TEST_USD.decimals, '0'));
  if (amount > maximum) throw new Error('That amount is too large.');
  return amount;
}

export const isTestUsd = (asset: { network: string; assetCategory?: string }) =>
  asset.network === VENN_TEST_USD.network && asset.assetCategory === VENN_TEST_USD.category;

export function requireTestUsd(asset: Parameters<typeof isTestUsd>[0]) {
  if (!isTestUsd(asset)) throw new Error('Venn accepts only the Venn Test USD category on Chipnet.');
}

export function tokenRecipient(address: string) {
  if (!/^bchtest:/i.test(address.trim())) throw new Error('Use a complete, token-aware Chipnet address.');
  const { kind } = decodeCashAddress(address, 'chipnet');
  if (kind !== 'p2pkh-tokens' && kind !== 'p2sh-tokens') throw new Error('Use a token-aware Chipnet address.');
  return lockingBytecodeForAddress(address, 'chipnet');
}
