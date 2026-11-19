import { createVirtualMachineBch2026, decodeTransaction as libauthDecode } from '@bitauth/libauth';
import { binToHex, hexToBin } from '../src/core/bytes';
import { publicKeyOf } from '../src/core/crypto';
import { type Output, type Transaction, encodeTransaction, txidOf } from '../src/core/tx';
import type { Utxo } from '../src/core/draft';

const consensus = createVirtualMachineBch2026(false);
const standard = createVirtualMachineBch2026(true);

/** Libauth form of outputs, produced by round-tripping our own encoder through libauth's decoder. */
const toLibauthOutputs = (outputs: Output[]) => {
  const carrier: Transaction = {
    version: 2,
    locktime: 0,
    inputs: [{ txid: '00'.repeat(32), vout: 0, sequence: 0, unlockingBytecode: new Uint8Array() }],
    outputs,
  };
  const decoded = libauthDecode(encodeTransaction(carrier));
  if (typeof decoded === 'string') throw new Error(decoded);
  return decoded.outputs;
};

/** Verifies with the real BCH 2026 VM. Returns true or the VM error string. */
export const vmVerify = (tx: Transaction, sources: Output[], standardness = true): true | string => {
  const decoded = libauthDecode(encodeTransaction(tx));
  if (typeof decoded === 'string') return `decode: ${decoded}`;
  const vm = standardness ? standard : consensus;
  const result = vm.verify({ transaction: decoded, sourceOutputs: toLibauthOutputs(sources) });
  return result === true ? true : String(result);
};

export const key = (n: number) => {
  const privateKey = hexToBin(n.toString(16).padStart(64, '0'));
  const publicKey = publicKeyOf(privateKey);
  return { privateKey, publicKey, hex: binToHex(publicKey) };
};

export const fakeTxid = (n: number) => n.toString(16).padStart(64, 'a');

/** Turns an output of a built transaction into a spendable UTXO. */
export const utxoFrom = (tx: Transaction, vout: number, height = 100): Utxo => {
  const o = tx.outputs[vout];
  return {
    txid: txidOf(tx),
    vout,
    value: o.value,
    height,
    lockingBytecode: o.lockingBytecode,
    ...(o.token ? { token: o.token } : {}),
  };
};
