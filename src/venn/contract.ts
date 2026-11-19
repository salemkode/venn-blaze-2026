// Rebuilds a Venn's contracts from the official templates: the Venn contract itself (rules
// NFT and cards) and its VennMoney contract, where the Venn's money is held.
import { type Bytes, binToHex, concat, hexToBin, reverse } from '../core/bytes';
import { addressForLockingBytecode, type Network } from '../core/cashaddr';
import { hash256 } from '../core/crypto';
import { pushData, pushNumber } from '../core/script';
import { MONEY, VAULT } from './artifact';

export interface VennParams {
  network: Network;
  /** The vault's own token category (displayed byte order). */
  vaultCategory: string;
  /** The asset the vault holds; absent for BCH. */
  assetCategory?: string;
}

export type VennFunction = (typeof VAULT.functions)[number];

/** OP_UTXOTOKENCATEGORY returns categories in transaction byte order. */
export const categoryBytes = (hex: string, what: string): Bytes => {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error(`Invalid ${what}`);
  return reverse(hexToBin(hex));
};

/** P2SH32 locking bytecode for a redeem script. */
export const p2sh32 = (redeem: Bytes): Bytes => concat(Uint8Array.of(0xaa, 0x20), hash256(redeem), Uint8Array.of(0x87));

export const vennRedeem = (p: VennParams, template: string = VAULT.template): Bytes => {
  const values: Record<(typeof VAULT.constructor)[number], Bytes> = {
    vaultCategory: categoryBytes(p.vaultCategory, 'vault category'),
    assetCategory: p.assetCategory ? categoryBytes(p.assetCategory, 'token category') : new Uint8Array(),
  };
  const args = [...VAULT.constructor].reverse().map(name => pushData(values[name]));
  return concat(...args, hexToBin(template));
};

/** Where the rules NFT and the member cards live. */
export const vennLocking = (p: VennParams, template?: string): Bytes => p2sh32(vennRedeem(p, template));

/** VennMoney for the contract at `lock`: money that moves only when that contract leads. */
export const moneyRedeemFor = (lock: Bytes, template: string = MONEY.template): Bytes =>
  concat(pushData(lock), hexToBin(template));
export const moneyLockingFor = (lock: Bytes, template?: string): Bytes => p2sh32(moneyRedeemFor(lock, template));

/** Where the Venn's money lives. */
export const moneyLocking = (p: VennParams): Bytes => moneyLockingFor(vennLocking(p));

/** Deposit address: the money address. `tokens` gives the token-aware form needed for tokens. */
export const vennAddress = (p: VennParams, tokens = false): string =>
  addressForLockingBytecode(moneyLocking(p), p.network, tokens);

export const vennId = (p: VennParams): string => binToHex(hash256(vennLocking(p))).slice(0, 16);

/** Arguments in declaration order, pushed in reverse, then the selector and redeem script. */
export const vennUnlocking = (p: VennParams, fn: VennFunction, args: Bytes[]): Bytes => {
  const index = VAULT.functions.indexOf(fn);
  if (index < 0) throw new Error('Unknown Venn function');
  return concat(...[...args].reverse().map(pushData), pushNumber(index), pushData(vennRedeem(p)));
};

/** A money coin's unlocking: VennMoney has a single function and no arguments. */
export const moneyUnlockingFor = (lock: Bytes): Bytes => pushData(moneyRedeemFor(lock));
