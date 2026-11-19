import {
  type Bytes,
  binToHex,
  concat,
  hexToBin,
  readUintLE,
  readVarInt,
  reverse,
  uintLE,
  varInt,
  withLength,
} from './bytes';
import { hash256 } from './crypto';

export type Capability = 'none' | 'mutable' | 'minting';

export interface TokenData {
  /** Category as displayed (same byte order as a txid). */
  category: string;
  amount: bigint;
  nft?: { capability: Capability; commitment: string };
}

export interface Output {
  value: bigint;
  lockingBytecode: Bytes;
  token?: TokenData;
}

export interface Input {
  /** Outpoint txid as displayed. */
  txid: string;
  vout: number;
  sequence: number;
  unlockingBytecode: Bytes;
}

export interface Transaction {
  version: number;
  inputs: Input[];
  outputs: Output[];
  locktime: number;
}

export const SIGHASH_ALL_UTXOS = 0x61; // ALL | UTXOS | FORKID
export const SEQUENCE_FINAL = 0xffffffff;

const CAPABILITY: Record<Capability, number> = { none: 0, mutable: 1, minting: 2 };

export const encodeTokenPrefix = (token?: TokenData): Bytes => {
  if (!token) return new Uint8Array();
  const commitment = token.nft ? hexToBin(token.nft.commitment) : new Uint8Array();
  if (commitment.length > 128) throw new Error('NFT commitment too long');
  let bitfield = 0;
  if (token.nft) {
    bitfield |= 0x20 | CAPABILITY[token.nft.capability];
    if (commitment.length > 0) bitfield |= 0x40;
  }
  if (token.amount > 0n) bitfield |= 0x10;
  if (bitfield === 0) throw new Error('Empty token data');
  return concat(
    Uint8Array.of(0xef),
    reverse(hexToBin(token.category)),
    Uint8Array.of(bitfield),
    commitment.length > 0 ? withLength(commitment) : new Uint8Array(),
    token.amount > 0n ? varInt(token.amount) : new Uint8Array(),
  );
};

export const encodeOutput = (o: Output): Bytes =>
  concat(uintLE(o.value, 8), withLength(concat(encodeTokenPrefix(o.token), o.lockingBytecode)));

export const encodeOutpoint = (i: { txid: string; vout: number }): Bytes =>
  concat(reverse(hexToBin(i.txid)), uintLE(i.vout, 4));

export const encodeTransaction = (tx: Transaction): Bytes =>
  concat(
    uintLE(tx.version, 4),
    varInt(tx.inputs.length),
    ...tx.inputs.map(i => concat(encodeOutpoint(i), withLength(i.unlockingBytecode), uintLE(i.sequence, 4))),
    varInt(tx.outputs.length),
    ...tx.outputs.map(encodeOutput),
    uintLE(tx.locktime, 4),
  );

export const txidOf = (tx: Transaction | Bytes): string =>
  binToHex(reverse(hash256(tx instanceof Uint8Array ? tx : encodeTransaction(tx))));

const decodeTokenPrefix = (b: Bytes, o: number): { token: TokenData; size: number } => {
  const start = o;
  o += 1;
  const category = binToHex(reverse(b.slice(o, o + 32)));
  o += 32;
  const bitfield = b[o++];
  let commitment = '';
  if (bitfield & 0x40) {
    const len = readVarInt(b, o);
    o += len.size;
    commitment = binToHex(b.slice(o, o + Number(len.value)));
    o += Number(len.value);
  }
  let amount = 0n;
  if (bitfield & 0x10) {
    const a = readVarInt(b, o);
    o += a.size;
    amount = a.value;
  }
  const cap = (['none', 'mutable', 'minting'] as Capability[])[bitfield & 0x0f];
  const token: TokenData = { category, amount };
  if (bitfield & 0x20) {
    if (!cap) throw new Error('Invalid token capability');
    token.nft = { capability: cap, commitment };
  }
  return { token, size: o - start };
};

const decodeOutputAt = (bytes: Bytes, at: number): { output: Output; end: number } => {
  let o = at;
  const value = readUintLE(bytes, o, 8);
  o += 8;
  const len = readVarInt(bytes, o);
  o += len.size;
  const end = o + Number(len.value);
  if (end > bytes.length) throw new Error('Truncated output');
  let token: TokenData | undefined;
  if (bytes[o] === 0xef) {
    const t = decodeTokenPrefix(bytes, o);
    token = t.token;
    o += t.size;
  }
  return { output: { value, lockingBytecode: bytes.slice(o, end), ...(token ? { token } : {}) }, end };
};

/** A plain concatenation of serialized outputs (as used for request source outputs). */
export const decodeOutputs = (bytes: Bytes): Output[] => {
  const out: Output[] = [];
  for (let o = 0; o < bytes.length; ) {
    const d = decodeOutputAt(bytes, o);
    out.push(d.output);
    o = d.end;
    if (out.length > 500) throw new Error('Too many outputs');
  }
  return out;
};

export const decodeTransaction = (bytes: Bytes): Transaction => {
  let o = 0;
  const version = Number(readUintLE(bytes, o, 4));
  o += 4;
  const nIn = readVarInt(bytes, o);
  o += nIn.size;
  const inputs: Input[] = [];
  for (let i = 0; i < Number(nIn.value); i++) {
    const txid = binToHex(reverse(bytes.slice(o, o + 32)));
    const vout = Number(readUintLE(bytes, o + 32, 4));
    o += 36;
    const len = readVarInt(bytes, o);
    o += len.size;
    const unlockingBytecode = bytes.slice(o, o + Number(len.value));
    o += Number(len.value);
    const sequence = Number(readUintLE(bytes, o, 4));
    o += 4;
    inputs.push({ txid, vout, sequence, unlockingBytecode });
  }
  const nOut = readVarInt(bytes, o);
  o += nOut.size;
  const outputs: Output[] = [];
  for (let i = 0; i < Number(nOut.value); i++) {
    const value = readUintLE(bytes, o, 8);
    o += 8;
    const len = readVarInt(bytes, o);
    o += len.size;
    const end = o + Number(len.value);
    let token: TokenData | undefined;
    if (bytes[o] === 0xef) {
      const t = decodeTokenPrefix(bytes, o);
      token = t.token;
      o += t.size;
    }
    outputs.push({ value, lockingBytecode: bytes.slice(o, end), ...(token ? { token } : {}) });
    o = end;
  }
  const locktime = Number(readUintLE(bytes, o, 4));
  o += 4;
  if (o !== bytes.length) throw new Error('Trailing transaction bytes');
  return { version, inputs, outputs, locktime };
};

/**
 * BCH signature digest (BIP143-style with FORKID, SIGHASH_UTXOS and CashTokens).
 * Always ALL | UTXOS: every signer commits to every input, its value and every output.
 */
export const signatureDigest = (
  tx: Transaction,
  sourceOutputs: Output[],
  index: number,
  coveredBytecode: Bytes,
): Bytes => {
  if (sourceOutputs.length !== tx.inputs.length) throw new Error('Source outputs do not match inputs');
  const input = tx.inputs[index];
  const source = sourceOutputs[index];
  const preimage = concat(
    uintLE(tx.version, 4),
    hash256(concat(...tx.inputs.map(encodeOutpoint))),
    hash256(concat(...sourceOutputs.map(encodeOutput))),
    hash256(concat(...tx.inputs.map(i => uintLE(i.sequence, 4)))),
    encodeOutpoint(input),
    encodeTokenPrefix(source.token),
    withLength(coveredBytecode),
    uintLE(source.value, 8),
    uintLE(input.sequence, 4),
    hash256(concat(...tx.outputs.map(encodeOutput))),
    uintLE(tx.locktime, 4),
    uintLE(SIGHASH_ALL_UTXOS, 4),
  );
  return hash256(preimage);
};
