// Circle: a savings circle (jam'eya) on the CircleVault contract. Everyone pays the same
// contribution each round; each round the pot goes to the member whose turn it is, in the
// order fixed at creation. The Circle's state NFT and its contributions are public; nobody
// signs for the Circle itself, so contributions and payouts need only a fee payer.
import { type Bytes, binToHex, concat, equal, hexToBin, readUintLE, uintLE, utf8 } from '../core/bytes';
import { addressForLockingBytecode, type Network, p2pkhLockingBytecode } from '../core/cashaddr';
import { hash160 } from '../core/crypto';
import { encodeScriptNumber, pushData, pushNumber } from '../core/script';
import type { Transaction } from '../core/tx';
import { CIRCLE } from './artifact';
import { categoryBytes, moneyLockingFor, p2sh32 } from './contract';

export interface CircleParams {
  network: Network;
  /** The Circle's own token category (displayed byte order). */
  circleCategory: string;
  /** The token everyone contributes. */
  assetCategory: string;
  /** Token units each member pays each round. */
  contribution: bigint;
  /** Seconds per round. */
  period: bigint;
  /** Unix time the first round starts; round r's deadline is start + (r + 1) * period. */
  start: bigint;
  /** Key hashes (hex) in payout order: round 0's member first. */
  members: string[];
}

export type CircleFunction = (typeof CIRCLE.functions)[number];

export interface CircleState {
  /** 0 … members.length; members.length means every round has paid out. */
  round: number;
  /** Seats (payout positions) that paid this round, as a bitmap. */
  paid: number;
  /** Seats that have missed any round, as a bitmap. */
  missed: number;
}

export const CIRCLE_MARKER = 'CIR1';
export const CIRCLE_STATE_BYTES = 8;
export const MIN_CIRCLE = 2;
export const MAX_CIRCLE = 16;
export const MIN_ROUND_SECONDS = 3_600n;

export const encodeCircleState = (s: CircleState): string =>
  binToHex(concat(Uint8Array.of(1), uintLE(s.round, 1), uintLE(s.paid, 3), uintLE(s.missed, 3)));

export const decodeCircleState = (hex: string, members: number): CircleState => {
  const b = hexToBin(hex);
  if (b.length !== CIRCLE_STATE_BYTES || b[0] !== 1) throw new Error('Not a Circle');
  const all = 2 ** members;
  const state = { round: b[1], paid: Number(readUintLE(b, 2, 3)), missed: Number(readUintLE(b, 5, 3)) };
  if (state.round > members || state.paid >= all || state.missed >= all) throw new Error('Not a Circle');
  return state;
};

export const FRESH_CIRCLE: CircleState = { round: 0, paid: 0, missed: 0 };

export const validateCircle = (p: CircleParams): void => {
  if (p.members.length < MIN_CIRCLE || p.members.length > MAX_CIRCLE)
    throw new Error(`A Circle needs ${MIN_CIRCLE} to ${MAX_CIRCLE} members`);
  if (!p.members.every(m => /^[0-9a-f]{40}$/.test(m))) throw new Error('Invalid member address');
  if (new Set(p.members).size !== p.members.length) throw new Error('Each member can have only one turn');
  if (p.contribution <= 0n || p.contribution >= 1n << 62n) throw new Error('Choose a contribution');
  if (p.period < MIN_ROUND_SECONDS || p.period >= 1n << 40n) throw new Error('A round must last at least an hour');
  if (p.start < 500_000_000n || p.start >= 1n << 40n) throw new Error('Invalid start time');
  // Every deadline must fit a transaction locktime (the contract refuses money otherwise).
  if (p.start + BigInt(p.members.length) * p.period > 0xffffffffn) throw new Error('The rounds run past the year 2106');
  categoryBytes(p.circleCategory, 'circle category');
  categoryBytes(p.assetCategory, 'token category');
};

export const circleRedeem = (p: CircleParams, template: string = CIRCLE.template): Bytes => {
  const values: Record<(typeof CIRCLE.constructor)[number], Bytes> = {
    circleCategory: categoryBytes(p.circleCategory, 'circle category'),
    assetCategory: categoryBytes(p.assetCategory, 'token category'),
    contribution: encodeScriptNumber(p.contribution),
    period: encodeScriptNumber(p.period),
    start: encodeScriptNumber(p.start),
    members: concat(...p.members.map(hexToBin)),
  };
  const args = [...CIRCLE.constructor].reverse().map(name => pushData(values[name]));
  return concat(...args, hexToBin(template));
};

/** Where the state NFT lives. */
export const circleLocking = (p: CircleParams, template?: string): Bytes => p2sh32(circleRedeem(p, template));
/** Where contributions wait for the round's payout. */
export const circleMoneyLocking = (p: CircleParams): Bytes => moneyLockingFor(circleLocking(p));
/** Token-aware address contributions are paid to. */
export const circleMoneyAddress = (p: CircleParams): string =>
  addressForLockingBytecode(circleMoneyLocking(p), p.network, true);

export const circleUnlocking = (p: CircleParams, fn: CircleFunction, args: Bytes[]): Bytes => {
  const index = CIRCLE.functions.indexOf(fn);
  if (index < 0) throw new Error('Unknown Circle function');
  return concat(...[...args].reverse().map(pushData), pushNumber(index), pushData(circleRedeem(p)));
};

/** Round r's deadline: after it, the round may pay out without every contribution. */
export const roundDeadline = (p: CircleParams, round: number): bigint => p.start + BigInt(round + 1) * p.period;

export const seatsPaid = (bits: number, n: number) => Array.from({ length: n }, (_, i) => (bits >> i) & 1).filter(Boolean).length;
export const hasPaid = (bits: number, seat: number) => ((bits >> seat) & 1) === 1;

/** OP_RETURN <'CIR1'> <circle category> <asset category> <contribution> <period> <start> <plan or empty>. */
export const circleMarker = (p: CircleParams, plan?: string): Bytes =>
  concat(
    Uint8Array.of(0x6a),
    pushData(utf8(CIRCLE_MARKER)),
    pushData(hexToBin(p.circleCategory)),
    pushData(hexToBin(p.assetCategory)),
    pushNumber(p.contribution),
    pushNumber(p.period),
    pushNumber(p.start),
    pushData(plan ? hexToBin(plan) : new Uint8Array()),
  );

/** Reads a script's pushes; null when it contains anything but pushes. */
const readPushes = (script: Bytes): Bytes[] | null => {
  const out: Bytes[] = [];
  let i = 0;
  while (i < script.length) {
    const op = script[i++];
    let len: number;
    if (op === 0x00) len = 0;
    else if (op >= 0x51 && op <= 0x60) {
      out.push(Uint8Array.of(op - 0x50));
      continue;
    } else if (op === 0x4f) {
      out.push(Uint8Array.of(0x81));
      continue;
    } else if (op <= 0x4b) len = op;
    else if (op === 0x4c && i < script.length) len = script[i++];
    else if (op === 0x4d && i + 1 < script.length) {
      len = script[i] | (script[i + 1] << 8);
      i += 2;
    } else return null;
    if (i + len > script.length) return null;
    out.push(script.slice(i, i + len));
    i += len;
  }
  return out;
};

const readNumber = (b: Bytes): bigint => {
  if (b.length === 0) return 0n;
  if (b[b.length - 1] & 0x80) throw new Error('negative');
  return readUintLE(b, 0, b.length);
};

/**
 * Reads a Circle's parameters from the transaction that created it: the marker gives the
 * numbers and the outputs between the state NFT and the marker give the members in order.
 */
export function readCircleGenesis(tx: Transaction, network: Network): { params: CircleParams; plan?: string } | null {
  if (tx.inputs[0]?.vout !== 0) return null;
  const markerAt = tx.outputs.findIndex(o => o.lockingBytecode[0] === 0x6a);
  if (markerAt < 3) return null;
  const pushes = readPushes(tx.outputs[markerAt].lockingBytecode.slice(1));
  if (!pushes || pushes.length !== 7 || new TextDecoder().decode(pushes[0]) !== CIRCLE_MARKER) return null;
  if (pushes[1].length !== 32 || pushes[2].length !== 32) return null;
  const circleCategory = binToHex(pushes[1]);
  if (circleCategory !== tx.inputs[0].txid) return null;
  const members: string[] = [];
  for (const o of tx.outputs.slice(1, markerAt)) {
    const b = o.lockingBytecode;
    if (b.length !== 25 || b[0] !== 0x76 || b[1] !== 0xa9 || b[2] !== 0x14 || b[23] !== 0x88 || b[24] !== 0xac) return null;
    members.push(binToHex(b.slice(3, 23)));
  }
  try {
    const params: CircleParams = {
      network,
      circleCategory,
      assetCategory: binToHex(pushes[2]),
      contribution: readNumber(pushes[3]),
      period: readNumber(pushes[4]),
      start: readNumber(pushes[5]),
      members,
    };
    validateCircle(params);
    const plan = pushes[6].length === 32 ? binToHex(pushes[6]) : undefined;
    if (pushes[6].length !== 0 && !plan) return null;
    return { params, ...(plan ? { plan } : {}) };
  } catch {
    return null;
  }
}

/**
 * Checks that `genesis` created exactly this Circle: one state NFT, fresh and mutable, at the
 * Circle address, members and numbers as given, and no other token of the Circle category.
 */
export function verifyCircleGenesis(p: CircleParams, genesis: Transaction): void {
  const read = readCircleGenesis(genesis, p.network);
  if (!read) throw new Error('This transaction did not create a Circle');
  const same =
    read.params.circleCategory === p.circleCategory &&
    read.params.assetCategory === p.assetCategory &&
    read.params.contribution === p.contribution &&
    read.params.period === p.period &&
    read.params.start === p.start &&
    read.params.members.join() === p.members.join();
  if (!same) throw new Error('The Circle’s settings differ from its creation');
  const ours = genesis.outputs.filter(o => o.token?.category === p.circleCategory);
  if (ours.length !== 1) throw new Error('The Circle token was split');
  const [state] = ours;
  if (genesis.outputs[0] !== state || !equal(state.lockingBytecode, circleLocking(p)))
    throw new Error('The Circle token went to another address');
  if (state.token!.amount !== 0n || state.token!.nft?.capability !== 'mutable')
    throw new Error('The Circle token has the wrong type');
  if (state.token!.nft.commitment !== encodeCircleState(FRESH_CIRCLE)) throw new Error('The Circle did not start fresh');
}

/** The member key hash for a public key, as the Circle stores it. */
export const memberOf = (publicKey: Bytes) => binToHex(hash160(publicKey));
export const payoutLocking = (pkh: string): Bytes => p2pkhLockingBytecode(hexToBin(pkh));

