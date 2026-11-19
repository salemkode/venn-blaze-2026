import { type Bytes, concat, equal } from './bytes';

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATORS = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];

export type Network = 'chipnet' | 'mainnet';
export const PREFIX: Record<Network, string> = { chipnet: 'bchtest', mainnet: 'bitcoincash' };

export type AddressKind = 'p2pkh' | 'p2sh' | 'p2pkh-tokens' | 'p2sh-tokens';
const KIND_TYPE: Record<AddressKind, number> = { p2pkh: 0, p2sh: 1, 'p2pkh-tokens': 2, 'p2sh-tokens': 3 };
const SIZE_BITS: Record<number, number> = { 20: 0, 24: 1, 28: 2, 32: 3, 40: 4, 48: 5, 56: 6, 64: 7 };

const polymod = (values: number[]): bigint => {
  let c = 1n;
  for (const d of values) {
    const c0 = c >> 35n;
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d);
    for (let i = 0; i < 5; i++) if ((c0 >> BigInt(i)) & 1n) c ^= GENERATORS[i];
  }
  return c ^ 1n;
};

const convertBits = (data: ArrayLike<number>, from: number, to: number, pad: boolean): number[] => {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const max = (1 << to) - 1;
  for (let i = 0; i < data.length; i++) {
    acc = (acc << from) | data[i];
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & max);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & max);
  } else if (bits >= from || ((acc << (to - bits)) & max) !== 0) {
    throw new Error('Invalid address padding');
  }
  return out;
};

const prefixData = (prefix: string) => [...prefix].map(c => c.charCodeAt(0) & 31).concat(0);

export const encodeCashAddress = (network: Network, kind: AddressKind, hash: Bytes): string => {
  const sizeBits = SIZE_BITS[hash.length];
  if (sizeBits === undefined) throw new Error('Unsupported hash length');
  const prefix = PREFIX[network];
  const payload = convertBits(concat(Uint8Array.of((KIND_TYPE[kind] << 3) | sizeBits), hash), 8, 5, true);
  const mod = polymod([...prefixData(prefix), ...payload, 0, 0, 0, 0, 0, 0, 0, 0]);
  const checksum = Array.from({ length: 8 }, (_, i) => Number((mod >> BigInt(5 * (7 - i))) & 31n));
  return `${prefix}:${[...payload, ...checksum].map(v => CHARSET[v]).join('')}`;
};

export interface DecodedAddress {
  network: Network;
  kind: AddressKind;
  hash: Bytes;
}

export const decodeCashAddress = (input: string, expected?: Network): DecodedAddress => {
  const raw = input.trim();
  if (raw !== raw.toLowerCase() && raw !== raw.toUpperCase()) throw new Error('Mixed-case address');
  const lower = raw.toLowerCase();
  let prefix: string;
  let body: string;
  if (lower.includes(':')) [prefix, body] = lower.split(':', 2) as [string, string];
  else {
    prefix = PREFIX[expected ?? 'chipnet'];
    body = lower;
  }
  const network = (Object.keys(PREFIX) as Network[]).find(n => PREFIX[n] === prefix);
  if (!network) throw new Error('Unknown address prefix');
  if (expected && network !== expected) throw new Error(`This is a ${network} address. Use a ${expected} address.`);
  const values = [...body].map(c => CHARSET.indexOf(c));
  if (values.length < 9 || values.some(v => v < 0)) throw new Error('Invalid address characters');
  if (polymod([...prefixData(prefix), ...values]) !== 0n) throw new Error('Address checksum is wrong');
  const bytes = Uint8Array.from(convertBits(values.slice(0, -8), 5, 8, false));
  const version = bytes[0];
  const hash = bytes.slice(1);
  const kind = (Object.keys(KIND_TYPE) as AddressKind[]).find(k => KIND_TYPE[k] === version >> 3);
  if (!kind || (version & 0x80) !== 0) throw new Error('Unsupported address type');
  if (SIZE_BITS[hash.length] !== (version & 7)) throw new Error('Address length mismatch');
  return { network, kind, hash };
};

export const lockingBytecodeForAddress = (address: string, expected?: Network): Bytes => {
  const { kind, hash } = decodeCashAddress(address, expected);
  if (kind === 'p2pkh' || kind === 'p2pkh-tokens') {
    if (hash.length !== 20) throw new Error('Unsupported address');
    return concat(Uint8Array.of(0x76, 0xa9, 0x14), hash, Uint8Array.of(0x88, 0xac));
  }
  if (hash.length === 20) return concat(Uint8Array.of(0xa9, 0x14), hash, Uint8Array.of(0x87));
  if (hash.length === 32) return concat(Uint8Array.of(0xaa, 0x20), hash, Uint8Array.of(0x87));
  throw new Error('Unsupported address');
};

export const addressForLockingBytecode = (bytecode: Bytes, network: Network, tokens = false): string => {
  if (
    bytecode.length === 25 &&
    equal(bytecode.slice(0, 3), Uint8Array.of(0x76, 0xa9, 0x14)) &&
    bytecode[23] === 0x88 &&
    bytecode[24] === 0xac
  )
    return encodeCashAddress(network, tokens ? 'p2pkh-tokens' : 'p2pkh', bytecode.slice(3, 23));
  if (bytecode.length === 23 && bytecode[0] === 0xa9 && bytecode[1] === 0x14 && bytecode[22] === 0x87)
    return encodeCashAddress(network, tokens ? 'p2sh-tokens' : 'p2sh', bytecode.slice(2, 22));
  if (bytecode.length === 35 && bytecode[0] === 0xaa && bytecode[1] === 0x20 && bytecode[34] === 0x87)
    return encodeCashAddress(network, tokens ? 'p2sh-tokens' : 'p2sh', bytecode.slice(2, 34));
  throw new Error('Not a standard address output');
};

export const p2pkhLockingBytecode = (pubkeyHash: Bytes): Bytes =>
  concat(Uint8Array.of(0x76, 0xa9, 0x14), pubkeyHash, Uint8Array.of(0x88, 0xac));
