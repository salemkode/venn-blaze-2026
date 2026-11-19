import { secp256k1 } from '@noble/curves/secp256k1.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import type { Bytes } from './bytes';

export const sha256 = (b: Bytes): Bytes => nobleSha256(b);
export const hash256 = (b: Bytes): Bytes => nobleSha256(nobleSha256(b));
export const hash160 = (b: Bytes): Bytes => ripemd160(nobleSha256(b));

export interface KeyPair {
  privateKey: Bytes;
  publicKey: Bytes;
}

/** The Venn key: the wallet's account on the branch react-native-xo calls "defi" (7). */
export const vennKeyPath = (coinType: number) => `m/44'/${coinType}'/0'/7/0`;

export const keyFromMnemonic = (phrase: string, path: string): KeyPair => {
  const normalized = phrase.trim().normalize('NFKD').split(/\s+/).join(' ');
  if (!validateMnemonic(normalized, wordlist)) throw new Error('This recovery phrase is not valid');
  const node = HDKey.fromMasterSeed(mnemonicToSeedSync(normalized)).derive(path);
  if (!node.privateKey) throw new Error('Key derivation failed');
  return { privateKey: node.privateKey, publicKey: secp256k1.getPublicKey(node.privateKey, true) };
};

export const publicKeyOf = (privateKey: Bytes): Bytes => secp256k1.getPublicKey(privateKey, true);

export const isValidPublicKey = (pub: Bytes): boolean => {
  if (pub.length !== 33 || (pub[0] !== 2 && pub[0] !== 3)) return false;
  try {
    secp256k1.Point.fromBytes(pub);
    return true;
  } catch {
    return false;
  }
};

/** ECDSA signature over a 32-byte digest, DER encoded with low S. */
export const signDigest = (digest: Bytes, privateKey: Bytes): Bytes =>
  secp256k1.sign(digest, privateKey, { prehash: false, format: 'der', lowS: true, extraEntropy: false });

export const verifyDigest = (signatureDer: Bytes, digest: Bytes, publicKey: Bytes): boolean => {
  try {
    return secp256k1.verify(signatureDer, digest, publicKey, { prehash: false, format: 'der', lowS: true });
  } catch {
    return false;
  }
};
