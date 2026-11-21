// What a saved proposal asked for, so it can be made again from the Venn's current coins when the
// Venn changed after it was proposed ("Refresh and re-propose"). Stored as JSON with bigints and
// byte strings tagged, because a VoteChange carries both.
import { binToHex, hexToBin } from '../core/bytes';
import type { VoteChange } from './build';

export type Remake =
  | { kind: 'vote'; change: VoteChange; title: string; names?: Record<string, string> }
  | { kind: 'recoveryRequest'; target: string; newPublicKey: string; strong: boolean }
  | { kind: 'recoveryCancelByVote'; target: string };

export const encodeRemake = (r: Remake) =>
  JSON.stringify(r, (_, v) =>
    typeof v === 'bigint' ? { $big: v.toString() } : v instanceof Uint8Array ? { $bytes: binToHex(v) } : v,
  );

export const decodeRemake = (text: string): Remake =>
  JSON.parse(text, (_, v) =>
    v && typeof v === 'object' && typeof v.$big === 'string'
      ? BigInt(v.$big)
      : v && typeof v === 'object' && typeof v.$bytes === 'string'
        ? hexToBin(v.$bytes)
        : v,
  );
