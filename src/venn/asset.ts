import { type Network, decodeCashAddress, lockingBytecodeForAddress } from '../core/cashaddr';

/** The one fungible CashToken a Venn or Circle may hold on a network. Amounts are integer cents. */
export interface VennAsset {
  network: Network;
  category: string;
  symbol: string;
  decimals: 2;
  /** Said once wherever the asset is chosen, so nobody mistakes what they hold. */
  caution: string;
}

export const VENN_TEST_USD: VennAsset = {
  network: 'chipnet',
  category: '4514d3386913330eb7ebdb76187e8c2029b6f1a9556d5a22328e6b099591507e',
  symbol: 'Venn Test USD',
  decimals: 2,
  caution: 'Venn Test USD is a Chipnet test token with no value.',
};

/**
 * Moria USD (Riften Labs), two decimals: https://docs.riftenlabs.com/moria/technical/deployment/.
 * Moria disabled its v1 contract in April 2026, so no new MUSD is minted; existing MUSD trades on
 * Cauldron. Checked on 19 November 2026.
 */
export const MUSD: VennAsset = {
  network: 'mainnet',
  category: 'b38a33f750f84c5c169a6f23cb873e6e79605021585d4f3408789689ed87f366',
  symbol: 'MUSD',
  decimals: 2,
  caution:
    'MUSD is Moria USD on Bitcoin Cash. Moria stopped minting new MUSD in April 2026, so its dollar value depends on what others will pay for it.',
};

export const vennAsset = (network: Network): VennAsset => (network === 'mainnet' ? MUSD : VENN_TEST_USD);

export const VENN_FEE_ALLOCATION = 25_000n;
const cents = 100n;
const maximum = (1n << 63n) - 1n;

export const formatAssetAmount = (amount: bigint) => `${amount / cents}.${String(amount % cents).padStart(2, '0')}`;

/** Parses an amount to the nearest cent (two decimals, any of the Venn assets). */
export function parseCents(input: string, what = 'an amount') {
  const value = input.trim();
  if (!/^\d{1,17}(\.\d{0,2})?$/.test(value)) throw new Error(`Enter ${what} to the nearest cent.`);
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * cents + BigInt(fraction.padEnd(2, '0'));
  if (amount > maximum) throw new Error('That amount is too large.');
  return amount;
}

export const parseAssetAmount = (input: string, network: Network) => parseCents(input, vennAsset(network).symbol);

export const isVennAsset = (asset: { network: string; assetCategory?: string }) =>
  (asset.network === 'chipnet' || asset.network === 'mainnet') &&
  asset.assetCategory === vennAsset(asset.network).category;

export function requireVennAsset(asset: Parameters<typeof isVennAsset>[0]) {
  if (!isVennAsset(asset)) {
    const network = asset.network === 'mainnet' ? 'mainnet' : 'chipnet';
    throw new Error(`Venn accepts only ${vennAsset(network).symbol} on ${network === 'mainnet' ? 'Mainnet' : 'Chipnet'}.`);
  }
}

const PREFIX = { chipnet: 'bchtest:', mainnet: 'bitcoincash:' } as const;
const NAME = { chipnet: 'Chipnet', mainnet: 'Mainnet' } as const;

export function tokenRecipient(address: string, network: Network) {
  if (!address.trim().toLowerCase().startsWith(PREFIX[network]))
    throw new Error(`Use a complete, token-aware ${NAME[network]} address.`);
  const { kind } = decodeCashAddress(address, network);
  if (kind !== 'p2pkh-tokens' && kind !== 'p2sh-tokens') throw new Error(`Use a token-aware ${NAME[network]} address.`);
  return lockingBytecodeForAddress(address, network);
}

export const networkName = (network: Network) => (network === 'mainnet' ? 'Mainnet' : 'Chipnet');
/** What pays network fees: Chipnet test coins or real BCH. */
export const feeUnit = (network: Network) => (network === 'mainnet' ? 'BCH' : 'tBCH');
