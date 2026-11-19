// Consent before creation. The creator shares an invitation: the full plan with one seat
// per person. Each person reads their own summary and accepts by signing the plan's
// fingerprint and their seat with their Venn key. The acceptance goes back as a code.
import { base64ToBin, binToBase64, binToUtf8, utf8ToBin } from '@bitauth/libauth';
import { z } from 'zod';
import { binToHex, hexToBin } from '../core/bytes';
import { sha256, signDigest, verifyDigest } from '../core/crypto';
import type { Plan } from './presets';

const INVITE = 'venn:invite:';
const ACCEPT = 'venn:accept:';

const amount = z.string().regex(/^\d{1,19}$/);
const seatSchema = z.object({
  name: z.string().min(1).max(40),
  roles: z.number().int().min(1).max(15),
  budgetMode: z.number().int().min(0).max(2),
  budget: amount,
  period: amount,
  cap: amount,
});
const inviteSchema = z.object({
  v: z.literal(1),
  network: z.enum(['chipnet', 'mainnet']),
  name: z.string().min(1).max(40),
  type: z.enum(['personal', 'shared', 'pot', 'circle']),
  assetCategory: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  creator: z.string().regex(/^0[23][0-9a-f]{64}$/),
  seats: z.array(seatSchema).min(1).max(20),
  settings: z.record(z.string(), z.union([z.number(), z.boolean()])),
  /** Circle: seat numbers in the order they receive the pot. */
  turns: z.array(z.number().int().min(0)).optional(),
  /** Circle: what everyone pays each round and the round length in seconds. */
  circle: z.object({ contribution: amount, period: amount }).optional(),
});
export type Invite = z.infer<typeof inviteSchema>;

const acceptSchema = z.object({
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  seat: z.number().int().min(0).max(19),
  publicKey: z.string().regex(/^0[23][0-9a-f]{64}$/),
  signature: z.string().regex(/^[0-9a-f]{16,160}$/),
});
export type Acceptance = z.infer<typeof acceptSchema>;

const encode = (prefix: string, value: unknown) =>
  prefix +
  binToBase64(utf8ToBin(JSON.stringify(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/[=]+$/, '');
const decode = (prefix: string, text: string) => {
  const body = text.trim();
  if (!body.startsWith(prefix)) throw new Error('This is not a Venn code.');
  const b64 = body.slice(prefix.length).replaceAll('-', '+').replaceAll('_', '/');
  try {
    return JSON.parse(binToUtf8(base64ToBin(b64 + '='.repeat((4 - (b64.length % 4)) % 4)) as Uint8Array));
  } catch {
    throw new Error('Part of this code is missing or changed. Copy the whole code again.');
  }
};

/** Schema problems mean the code was edited or made by another app; say so instead of listing fields. */
const read = <T,>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error('This code was changed or made by a different version of Venn.');
  return result.data;
};

/** The invitation for a plan; seat 0 is the creator. */
export function inviteFor(plan: Plan, network: 'chipnet' | 'mainnet', assetCategory?: string): Invite {
  return inviteSchema.parse({
    v: 1,
    network,
    assetCategory,
    name: plan.name,
    type: plan.type,
    creator: plan.members[0].publicKey,
    seats: plan.members.map(m => ({
      name: m.name,
      roles: m.roles,
      budgetMode: m.budgetMode,
      budget: m.budget.toString(),
      period: m.period.toString(),
      cap: m.cap.toString(),
    })),
    settings: plan.settings,
    ...(plan.turns ? { turns: plan.turns } : {}),
    ...(plan.circle
      ? { circle: { contribution: plan.circle.contribution.toString(), period: plan.circle.period.toString() } }
      : {}),
  });
}

/** What every member signs: the whole plan, without the other members' keys. */
export const fingerprint = (invite: Invite) => binToHex(sha256(utf8ToBin(JSON.stringify(inviteSchema.parse(invite)))));

const seatDigest = (fp: string, seat: number) => sha256(utf8ToBin(`venn-accept:${fp}:${seat}`));

export const encodeInvite = (invite: Invite) => encode(INVITE, inviteSchema.parse(invite));
export const decodeInvite = (text: string): Invite => read(inviteSchema, decode(INVITE, text));

export function accept(
  invite: Invite,
  seat: number,
  key: { privateKey: Uint8Array; publicKey: Uint8Array },
): Acceptance {
  if (!invite.seats[seat]) throw new Error('There is no such seat in this invitation.');
  const fp = fingerprint(invite);
  return {
    fingerprint: fp,
    seat,
    publicKey: binToHex(key.publicKey),
    signature: binToHex(signDigest(seatDigest(fp, seat), key.privateKey)),
  };
}

export const encodeAcceptance = (a: Acceptance) => encode(ACCEPT, acceptSchema.parse(a));

/** Reads an acceptance and checks it signs this invitation. */
export function decodeAcceptance(text: string, invite: Invite): Acceptance {
  const a = read(acceptSchema, decode(ACCEPT, text));
  if (a.fingerprint !== fingerprint(invite)) throw new Error('This acceptance is for a different plan.');
  if (!invite.seats[a.seat]) throw new Error('This acceptance is for a seat that does not exist.');
  if (!verifyDigest(hexToBin(a.signature), seatDigest(a.fingerprint, a.seat), hexToBin(a.publicKey)))
    throw new Error('This acceptance is not signed correctly.');
  return a;
}

/** The members to create the Venn with: the creator's key in seat 0, the rest from acceptances. */
export function membersFor(invite: Invite, creatorKey: string, acceptances: Acceptance[]) {
  if (creatorKey !== invite.creator) throw new Error('Only the person who wrote this plan can create it.');
  return invite.seats.map((seat, n) => {
    const publicKey = n === 0 ? creatorKey : acceptances.find(a => a.seat === n)?.publicKey;
    if (!publicKey) throw new Error(`${seat.name} has not accepted yet.`);
    return {
      publicKey,
      roles: seat.roles,
      budgetMode: seat.budgetMode,
      budget: BigInt(seat.budget),
      period: BigInt(seat.period),
      cap: BigInt(seat.cap),
    };
  });
}
