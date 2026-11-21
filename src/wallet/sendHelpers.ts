// Helpers for sending plain BCH from the wallet (QA 21 Nov, B5 and "no Max").
import { formatBch, parseBch } from 'react-native-xo/core';
import { type Network, decodeCashAddress, encodeCashAddress } from '../core/cashaddr';

/**
 * A token-aware (z…/r…) address names the same key or script as its plain form. The wallet only
 * pays plain addresses, so plain BCH to a token-aware address goes to the plain form. Anything
 * that doesn't decode is returned unchanged for the wallet to explain.
 */
export function plainAddress(input: string, network: Network): { address: string; converted: boolean } {
  const trimmed = input.trim();
  try {
    const { kind, hash } = decodeCashAddress(trimmed, network);
    if (kind === 'p2pkh-tokens') return { address: encodeCashAddress(network, 'p2pkh', hash), converted: true };
    if (kind === 'p2sh-tokens') return { address: encodeCashAddress(network, 'p2sh', hash), converted: true };
  } catch {
    // Not a valid address for this network: the wallet reports why.
  }
  return { address: trimmed, converted: false };
}

/** Locking bytecode length of a plain recipient: 25 for P2PKH, 23 for P2SH20, 35 for P2SH32. */
const recipientBytes = (address: string, network: Network) => {
  try {
    const { kind, hash } = decodeCashAddress(address, network);
    if (kind === 'p2pkh' || kind === 'p2pkh-tokens') return 25;
    return hash.length === 32 ? 35 : 23;
  } catch {
    return 35;
  }
};

/**
 * The most this wallet can send to `address` in one payment: every coin, less the network fee the
 * wallet charges (1 sat/byte; 148 bytes an input, two outputs). Null when nothing is left.
 */
export function maxSendable(
  balance: { balanceSatoshis: string; outputCount: number } | null,
  address: string,
  network: Network,
): string | null {
  if (!balance || balance.outputCount < 1) return null;
  const fee = BigInt(10 + balance.outputCount * 148 + 8 + 1 + recipientBytes(address, network) + 34);
  const amount = BigInt(balance.balanceSatoshis) - fee;
  return amount >= 546n ? formatBch(amount) : null;
}

/** Whether a typed amount is more than the whole balance (a fee comes on top, the review checks that). */
export function overBalance(amountBch: string, balance: { balanceSatoshis: string } | null): boolean {
  if (!balance || !amountBch) return false;
  try {
    return parseBch(amountBch) > BigInt(balance.balanceSatoshis);
  } catch {
    return false;
  }
}
