// Small byte helpers. Pure TypeScript so they run in Hermes, Node and tests alike.

export type Bytes = Uint8Array;

export const hexToBin = (hex: string): Bytes => {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) throw new Error('Invalid hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

export const binToHex = (bin: Bytes): string => {
  let s = '';
  for (const b of bin) s += b.toString(16).padStart(2, '0');
  return s;
};

export const concat = (...parts: Bytes[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

export const equal = (a: Bytes, b: Bytes): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

export const reverse = (b: Bytes): Bytes => Uint8Array.from(b).reverse();

export const utf8 = (s: string): Bytes => {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
};

/** Strict UTF-8 decoding (Hermes-safe, no TextDecoder needed). */
export const fromUtf8 = (b: Bytes): string => {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const x = b[i];
    let c: number;
    let n: number;
    if (x < 0x80) [c, n] = [x, 0];
    else if (x >= 0xc2 && x < 0xe0) [c, n] = [x & 31, 1];
    else if (x >= 0xe0 && x < 0xf0) [c, n] = [x & 15, 2];
    else if (x >= 0xf0 && x < 0xf5) [c, n] = [x & 7, 3];
    else throw new Error('Invalid UTF-8');
    for (let k = 1; k <= n; k++) {
      const y = b[i + k];
      if (y === undefined || (y & 0xc0) !== 0x80) throw new Error('Invalid UTF-8');
      c = (c << 6) | (y & 63);
    }
    if ((n === 2 && (c < 0x800 || (c >= 0xd800 && c < 0xe000))) || (n === 3 && (c < 0x10000 || c > 0x10ffff)))
      throw new Error('Invalid UTF-8');
    s += String.fromCodePoint(c);
    i += n + 1;
  }
  return s;
};

/** Little-endian unsigned integer of `bytes` length. */
export const uintLE = (value: number | bigint, bytes: number): Bytes => {
  let v = BigInt(value);
  if (v < 0n) throw new Error('Negative integer');
  const out = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error('Integer too large');
  return out;
};

export const readUintLE = (b: Bytes, offset: number, bytes: number): bigint => {
  let v = 0n;
  for (let i = bytes - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[offset + i]);
  return v;
};

/** Bitcoin CompactSize. */
export const varInt = (value: number | bigint): Bytes => {
  const v = BigInt(value);
  if (v < 0xfdn) return Uint8Array.of(Number(v));
  if (v <= 0xffffn) return concat(Uint8Array.of(0xfd), uintLE(v, 2));
  if (v <= 0xffffffffn) return concat(Uint8Array.of(0xfe), uintLE(v, 4));
  return concat(Uint8Array.of(0xff), uintLE(v, 8));
};

export const readVarInt = (b: Bytes, offset: number): { value: bigint; size: number } => {
  const first = b[offset];
  if (first < 0xfd) return { value: BigInt(first), size: 1 };
  const size = first === 0xfd ? 2 : first === 0xfe ? 4 : 8;
  return { value: readUintLE(b, offset + 1, size), size: size + 1 };
};

export const withLength = (b: Bytes): Bytes => concat(varInt(b.length), b);

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export const toBase64Url = (bytes: Bytes): string => {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
  }
  return out;
};

export const fromBase64Url = (s: string): Bytes => {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) throw new Error('Invalid code');
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const c of s) {
    buf = (buf << 6) | B64.indexOf(c);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
};
