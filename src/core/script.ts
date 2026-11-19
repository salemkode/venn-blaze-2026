import { type Bytes, concat, uintLE } from './bytes';

/** Minimally encoded VM number (little-endian sign-magnitude). */
export const encodeScriptNumber = (value: number | bigint): Bytes => {
  let v = BigInt(value);
  if (v === 0n) return new Uint8Array();
  const negative = v < 0n;
  if (negative) v = -v;
  const out: number[] = [];
  while (v > 0n) {
    out.push(Number(v & 0xffn));
    v >>= 8n;
  }
  if (out[out.length - 1] & 0x80) out.push(negative ? 0x80 : 0);
  else if (negative) out[out.length - 1] |= 0x80;
  return Uint8Array.from(out);
};

/** Minimal push of `data`, matching consensus minimal-push rules. */
export const pushData = (data: Bytes): Bytes => {
  if (data.length === 0) return Uint8Array.of(0x00);
  if (data.length === 1 && data[0] >= 1 && data[0] <= 16) return Uint8Array.of(0x50 + data[0]);
  if (data.length === 1 && data[0] === 0x81) return Uint8Array.of(0x4f);
  if (data.length <= 75) return concat(Uint8Array.of(data.length), data);
  if (data.length <= 0xff) return concat(Uint8Array.of(0x4c, data.length), data);
  if (data.length <= 0xffff) return concat(Uint8Array.of(0x4d), uintLE(data.length, 2), data);
  return concat(Uint8Array.of(0x4e), uintLE(data.length, 4), data);
};

export const pushNumber = (value: number | bigint): Bytes => pushData(encodeScriptNumber(value));
