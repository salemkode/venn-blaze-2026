// The Venn key: one key per wallet that holds its places in Venns and pays their fees.
// It is the wallet's own account on branch 7, derived only when something must be signed.
import { NETWORKS } from 'react-native-xo';
import { binToHex } from '../core/bytes';
import { encodeCashAddress } from '../core/cashaddr';
import { type KeyPair, hash160, keyFromMnemonic, vennKeyPath } from '../core/crypto';
import { decodeConnection } from '../wallet/connection';
import { readSecret } from '../wallet/secure';
import type { Network } from '../wallet/prefs';

export const vennKeyAddress = (publicKey: Uint8Array, network: Network) =>
  encodeCashAddress(network, 'p2pkh', hash160(publicKey));

/** Reads the wallet's phrase and derives its Venn key. Connected wallets have none. */
export async function vennKey(walletId: string, network: Network): Promise<KeyPair> {
  const secret = await readSecret(walletId);
  if (!secret) throw new Error('This wallet’s secure entry is missing.');
  if (decodeConnection(secret))
    throw new Error('Venns need a wallet whose recovery phrase is on this device. Connected wallets cannot join yet.');
  return keyFromMnemonic(secret, vennKeyPath(NETWORKS[network].coinType));
}

const publicKeys = new Map<string, string>();

/** The Venn key's public half, cached for the session. */
export async function vennPublicKey(walletId: string, network: Network) {
  const id = `${walletId}:${network}`;
  if (!publicKeys.has(id)) publicKeys.set(id, binToHex((await vennKey(walletId, network)).publicKey));
  return publicKeys.get(id)!;
}
