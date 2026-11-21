// What this device remembers about Venns: public facts only (the Venn's identity, its
// name and the names behind each seat), plans being prepared, and invitations accepted.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Acceptance, Invite } from './invite';

export interface SavedVenn {
  category: string;
  assetCategory?: string;
  name: string;
  type: Invite['type'];
  /** Seat names by key hash, when this device saw the plan. */
  names: Record<string, string>;
  turns?: number[];
  plan?: string;
  /** Contract version: 2. Venns saved before v2 (the removed v1 contract) are dropped on read. */
  version?: number;
  /** Followed from a Venn code (a new phone waiting for its recovery), not found as a seat. */
  following?: boolean;
}

/** A Circle: its contract parameters as strings, and the names behind each seat. */
export interface SavedCircle {
  category: string;
  assetCategory: string;
  contribution: string;
  period: string;
  start: string;
  /** Key hashes in payout order. */
  members: string[];
  name: string;
  names: Record<string, string>;
  plan?: string;
}

/** A group decision this device proposed, with the approvals collected so far. */
export interface SavedProposal {
  id: string;
  code: string;
  category: string;
  title: string;
  approvals: { publicKey: string; signature: string }[];
  /** How to make this proposal again from the Venn's current coins (see remake.ts). */
  remake?: string;
}

export interface Preparing {
  invite: Invite;
  acceptances: Acceptance[];
}

export interface Joining {
  invite: Invite;
  seat: number;
  fingerprint: string;
}

interface Book {
  /**
   * NAMES_VERSION once every saved seat name is one this device can vouch for (from acceptances it checked,
   * the invitation's creator key, or its own seat). Older books may hold names taken from the
   * order of cards in a creation transaction, which its creator chooses; they are reset.
   */
  namesVersion?: number;
  venns: SavedVenn[];
  circles: SavedCircle[];
  proposals: SavedProposal[];
  preparing: Preparing[];
  joining: Joining[];
}

const key = (walletId: string) => `venn.book.${walletId}`;
const empty = (): Book => ({ namesVersion: NAMES_VERSION, venns: [], circles: [], proposals: [], preparing: [], joining: [] });

export async function readBook(walletId: string): Promise<Book> {
  const saved = await AsyncStorage.getItem(key(walletId));
  // Defaults for missing lists only: a stored book without a names version is an old one.
  if (!saved) return empty();
  const { namesVersion: _fresh, ...lists } = empty();
  const book: Book = migrateNames({ ...lists, ...JSON.parse(saved) });
  // The app runs Venn v2 only; entries made with v1 are no longer kept.
  return { ...book, venns: book.venns.filter(v => v.version === 2) };
}

/** Resets seat names saved before names were limited to ones the device can vouch for. */
export const migrateNames = (book: Book): Book =>
  book.namesVersion === NAMES_VERSION
    ? book
    : {
        ...book,
        namesVersion: NAMES_VERSION,
        venns: book.venns.map(v => ({ ...v, names: {} })),
        circles: book.circles.map(c => ({ ...c, names: {} })),
      };

// 3: also resets books an intermediate build stamped 2 before it had actually reset them.
export const NAMES_VERSION = 3;

export async function updateBook(walletId: string, change: (book: Book) => Book) {
  const next = change(await readBook(walletId));
  await AsyncStorage.setItem(key(walletId), JSON.stringify(next));
  return next;
}
