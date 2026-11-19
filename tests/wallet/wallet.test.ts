import { describe, expect, it } from 'vitest';
import { connectionNetwork, decodeConnection, encodeConnection, toRelayJson } from '../../src/wallet/connection';
import { behind, withActive, withWallet, withoutWallet } from '../../src/wallet/registry';
import { dayLabel } from '../../src/wallet/history';

describe('wallet list', () => {
  it('numbers and colours new wallets and keeps one active', () => {
    let r = withWallet(null, 'a');
    r = withWallet(r, 'b');
    r = withWallet(r, 'c', { name: 'Electron', connected: true });
    expect(r.wallets.map(w => [w.name, w.color, w.connected])).toEqual([
      ['Wallet 1', 0, false],
      ['Wallet 2', 1, false],
      ['Electron', 2, true],
    ]);
    expect(behind(withActive(r, 'b')).map(w => w.id)).toEqual(['c', 'a']);
    expect(withoutWallet(r, 'c').activeId).toBe('a');
    expect(() => withoutWallet(withWallet(null, 'a'), 'a')).toThrow(/at least one/);
  });

  it('allows eight wallets and refuses a ninth', () => {
    let r = withWallet(null, 'w0');
    for (let n = 1; n < 8; n++) r = withWallet(r, `w${n}`);
    expect(() => withWallet(r, 'extra')).toThrow(/8 wallets/);
  });
});

describe('connected wallets', () => {
  const pairing = {
    privateKey: 'ab'.repeat(32),
    secret: 'relay-secret',
    walletPublicKey: '02' + 'cd'.repeat(32),
    walletName: 'Paytaca',
    paths: [{ name: 'receive', xpub: 'tpubD6Nz' }],
  };

  it('round-trips a pairing and tells its network from the keys', () => {
    const secret = encodeConnection(pairing);
    expect(decodeConnection(secret)?.walletName).toBe('Paytaca');
    expect(decodeConnection('abandon abandon')).toBeNull();
    expect(connectionNetwork(pairing)).toBe('chipnet');
    expect(connectionNetwork({ ...pairing, paths: [{ name: 'receive', xpub: 'xpub6' }] })).toBe('mainnet');
  });

  it('refuses a pairing without receive keys', () => {
    expect(() => encodeConnection({ ...pairing, paths: [{ name: 'change', xpub: 'tpub' }] })).toThrow(/receive/);
  });

  it('rejects ambiguous branch names before checking the network', () => {
    expect(() => encodeConnection({
      ...pairing,
      paths: [{ name: 'receive', xpub: 'xpub6' }, { name: 'receive', xpub: 'tpubD6Nz' }],
    })).toThrow(/duplicate/i);
  });

  it('rejects unrecognized receive key networks', () => {
    expect(() => encodeConnection({
      ...pairing,
      paths: [{ name: 'receive', xpub: 'unexpected-key' }],
    })).toThrow(/network/i);
  });

  it('sends bytes and big integers in the relay format', () => {
    expect(toRelayJson({ a: Uint8Array.of(1, 255), b: 5n })).toEqual({ a: '<Uint8Array: 0x01ff>', b: '<bigint: 5n>' });
  });
});

it('labels activity days', () => {
  const now = new Date(2026, 10, 17, 12).getTime();
  expect(dayLabel(null, now)).toBe('Pending');
  expect(dayLabel(now / 1000, now)).toBe('Today');
  expect(dayLabel(now / 1000 - 86_400, now)).toBe('Yesterday');
});
