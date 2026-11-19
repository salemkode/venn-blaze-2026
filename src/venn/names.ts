// Names for seats a wallet found on-chain, limited to what it can vouch for.
import { binToHex, hexToBin } from '../core/bytes';
import { hash160 } from '../core/crypto';
import type { Invite } from './invite';

/**
 * Seat names this wallet can vouch for: the creator's (their key is in the invitation) and its
 * own seat. Card order in a creation transaction is the creator's choice, so other names are not
 * taken from it; those seats keep a neutral label.
 */
export const trustedNames = (plan: Invite, mySeat: number | undefined, myPkh: string): Record<string, string> => ({
  [binToHex(hash160(hexToBin(plan.creator)))]: plan.seats[0].name,
  ...(mySeat !== undefined && plan.seats[mySeat] ? { [myPkh]: plan.seats[mySeat].name } : {}),
});
