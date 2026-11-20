// A connected (HD) wallet pays with change on its change branch. Its activity must net every
// address the wallet owns, or a payment reads as the whole input coin being sent.
import {
  binToHex,
  deriveHdPath,
  deriveHdPathRelative,
  deriveHdPrivateNodeFromSeed,
  deriveHdPublicNode,
  encodeHdPublicKey,
  encodeTransaction,
  hashTransaction,
  hexToBin,
  lockingBytecodeToCashAddress,
  publicKeyToP2pkhLockingBytecode,
} from '@bitauth/libauth';
import { expect, it } from 'vitest';
import { historyFor } from '../../src/wallet/history';

const seed = hexToBin('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
const account = deriveHdPath(deriveHdPrivateNodeFromSeed(seed, { throwErrors: true }), "m/44'/145'/0'");
if (typeof account === 'string') throw new Error(account);
const branch = (index: number) => {
  const node = deriveHdPathRelative(account, String(index));
  if (typeof node === 'string') throw new Error(node);
  return encodeHdPublicKey({ network: 'mainnet', node: deriveHdPublicNode(node) }).hdPublicKey;
};
const xpubs = [
  { name: 'receive', xpub: branch(0) },
  { name: 'change', xpub: branch(1) },
];
const lockingOf = (index: number, child: number) => {
  const node = deriveHdPathRelative(account, `${index}/${child}`);
  if (typeof node === 'string') throw new Error(node);
  return publicKeyToP2pkhLockingBytecode({ publicKey: deriveHdPublicNode(node).publicKey });
};
const addressOf = (bytecode: Uint8Array) => {
  const encoded = lockingBytecodeToCashAddress({ bytecode, prefix: 'bitcoincash' });
  if (typeof encoded === 'string') throw new Error(encoded);
  return encoded.address;
};

const receive0 = lockingOf(0, 0);
const change0 = lockingOf(1, 0);
const shop = hexToBin('76a914' + '11'.repeat(20) + '88ac');
const tx = (inputs: [string, number][], outputs: [Uint8Array, bigint][]) => {
  const bytes = encodeTransaction({
    version: 2,
    locktime: 0,
    inputs: inputs.map(([id, index]) => ({
      outpointTransactionHash: hexToBin(id),
      outpointIndex: index,
      sequenceNumber: 0,
      unlockingBytecode: Uint8Array.of(),
    })),
    outputs: outputs.map(([lockingBytecode, valueSatoshis]) => ({ lockingBytecode, valueSatoshis })),
  });
  return { id: hashTransaction(bytes), hex: binToHex(bytes) };
};
const funding = tx([['aa'.repeat(32), 0]], [[receive0, 100_000n]]);
const payment = tx([[funding.id, 0]], [[shop, 20_000n], [change0, 79_774n]]);

const histories = new Map([
  [addressOf(receive0), [{ tx_hash: funding.id, height: 100 }, { tx_hash: payment.id, height: 101 }]],
  [addressOf(change0), [{ tx_hash: payment.id, height: 101 }]],
]);
const raw = new Map([[funding.id, funding.hex], [payment.id, payment.hex]]);
const client = {
  async request(method: string, params: unknown[]) {
    if (method === 'blockchain.address.get_history') return histories.get(params[0] as string) ?? [];
    if (method === 'blockchain.transaction.get') return { hex: raw.get(params[0] as string), blocktime: 1_795_000_000 };
    throw new Error(`unexpected ${method}`);
  },
};

it('nets a payment across the receive and change branches of a connected wallet', async () => {
  const items = await historyFor(client, addressOf(receive0), 'bitcoincash', xpubs);
  expect(items.map(i => [i.txid, i.delta])).toEqual([
    [payment.id, '-20226'],
    [funding.id, '100000'],
  ]);
});

it('keeps the single-address view for wallets without branches', async () => {
  const items = await historyFor(client, addressOf(receive0), 'bitcoincash');
  expect(items.find(i => i.txid === funding.id)?.delta).toBe('100000');
});
