// Runs a transaction through the real BCH 2026 virtual machine (libauth), the same rules full
// nodes apply. Used by the in-browser "Try a Venn" so every step is checked for real.
import { createVirtualMachineBch2026, decodeTransaction as libauthDecode } from '@bitauth/libauth';
import { type Output, type Transaction, encodeTransaction } from '../core/tx';

let machines: { consensus: ReturnType<typeof createVirtualMachineBch2026>; standard: ReturnType<typeof createVirtualMachineBch2026> } | null = null;
const vm = () => (machines ??= { consensus: createVirtualMachineBch2026(false), standard: createVirtualMachineBch2026(true) });

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

/**
 * Verifies `tx` spending `sources`. Returns true, or the VM's error. `standard` also applies
 * relay (standardness) rules; consensus-only shows what a miner could include.
 */
export function vmVerify(tx: Transaction, sources: Output[], standard = true): true | string {
  const decoded = libauthDecode(encodeTransaction(tx));
  if (typeof decoded === 'string') return `decode: ${decoded}`;
  const machine = standard ? vm().standard : vm().consensus;
  const result = machine.verify({ transaction: decoded, sourceOutputs: toLibauthOutputs(sources) });
  return result === true ? true : String(result);
}
