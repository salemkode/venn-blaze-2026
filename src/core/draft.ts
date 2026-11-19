// Shared pieces for building, sizing and signing transactions.
import { type Bytes, concat, equal } from './bytes';
import { p2pkhLockingBytecode } from './cashaddr';
import { hash160, signDigest } from './crypto';
import { pushData } from './script';
import {
  type Output,
  type TokenData,
  type Transaction,
  SIGHASH_ALL_UTXOS,
  encodeTransaction,
  signatureDigest,
} from './tx';
import { type VennFunction, type VennParams, moneyLocking, moneyUnlockingFor, vennLocking, vennUnlocking } from '../venn/contract';
import { type CircleFunction, type CircleParams, circleLocking, circleMoneyLocking, circleUnlocking } from '../venn/circle';

export interface Utxo {
  txid: string;
  vout: number;
  value: bigint;
  /** 0 when unconfirmed. */
  height: number;
  lockingBytecode: Bytes;
  token?: TokenData;
}

/**
 * An unsigned transaction plus what a signer needs to check it. Input 0 of a Venn
 * transaction runs `fn` with `lead` (placeholders until finalised), other Venn inputs run
 * `follow`, the rest are P2PKH.
 */
export interface Draft {
  tx: Transaction;
  sources: Output[];
  fee: bigint;
  venn?: { params: VennParams; fn: VennFunction; lead: Bytes[] };
  /** A Circle transaction: input 0 runs `fn` with `args`; nobody signs for the Circle. */
  circle?: { params: CircleParams; fn: CircleFunction; args: Bytes[] };
  /** Present when every input is this key's P2PKH. */
  p2pkh?: { publicKey: string };
}

export const FEE_RATE = 1n;
export const DUST = 546n;
export const UNIT_SECONDS = 512;
export const TIME_LOCK_FLAG = 1 << 22;
/** BIP68 time-based relative lock in 512-second units. */
export const timeLockSequence = (units: number) => TIME_LOCK_FLAG | units;

const SIG_PLACEHOLDER = new Uint8Array(73).fill(0x30);

export const p2pkhForPublicKey = (publicKey: Bytes): Bytes => p2pkhLockingBytecode(hash160(publicKey));
export const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n);
export const sourceOf = (u: Utxo): Output => ({
  value: u.value,
  lockingBytecode: u.lockingBytecode,
  ...(u.token ? { token: u.token } : {}),
});
export const spendable = (utxos: Utxo[]) => utxos.filter(u => !u.token).sort((a, b) => (b.value > a.value ? 1 : -1));

/** The unlocking bytecode of a contract input (a Venn or Circle input, or one of their money coins). */
export const contractUnlocking = (draft: Draft, index: number, lead?: Bytes[]): Bytes | null => {
  const source = draft.sources[index].lockingBytecode;
  if (draft.venn) {
    const { params, fn } = draft.venn;
    const lock = vennLocking(params);
    if (index === 0) return vennUnlocking(params, fn, lead ?? draft.venn.lead);
    if (equal(source, lock)) return vennUnlocking(params, 'follow', []);
    if (equal(source, moneyLocking(params))) return moneyUnlockingFor(lock);
  }
  if (draft.circle) {
    const { params, fn, args } = draft.circle;
    const lock = circleLocking(params);
    if (index === 0) return circleUnlocking(params, fn, args);
    if (equal(source, lock)) return circleUnlocking(params, 'follow', []);
    if (equal(source, circleMoneyLocking(params))) return moneyUnlockingFor(lock);
  }
  return null;
};

const placeholderUnlocking = (draft: Draft, index: number): Bytes =>
  contractUnlocking(draft, index) ?? concat(pushData(SIG_PLACEHOLDER), pushData(new Uint8Array(33)));

export const estimateSize = (draft: Draft): number =>
  encodeTransaction({
    ...draft.tx,
    inputs: draft.tx.inputs.map((i, n) => ({ ...i, unlockingBytecode: placeholderUnlocking(draft, n) })),
  }).length;

/** Sets `fee` from the final size; `apply` moves the fee into the change output. */
export const settleFee = (draft: Draft, apply: (fee: bigint) => void): Draft => {
  let fee = 0n;
  for (let round = 0; round < 3; round++) {
    apply(fee);
    const next = BigInt(estimateSize(draft)) * FEE_RATE;
    if (next === fee) break;
    fee = next;
  }
  apply(fee);
  draft.fee = fee;
  return draft;
};

/** Signs every input as this key's P2PKH. */
export const signPersonal = (draft: Draft, privateKey: Bytes, publicKey: Bytes): Transaction => {
  const self = p2pkhForPublicKey(publicKey);
  const inputs = draft.tx.inputs.map((input, i) => {
    if (!equal(draft.sources[i].lockingBytecode, self)) throw new Error('Input does not belong to this key');
    const sig = concat(
      signDigest(signatureDigest(draft.tx, draft.sources, i, self), privateKey),
      Uint8Array.of(SIGHASH_ALL_UTXOS),
    );
    return { ...input, unlockingBytecode: concat(pushData(sig), pushData(publicKey)) };
  });
  return { ...draft.tx, inputs };
};

export const secondsUntil = (units: number, elapsed: number) => Math.max(0, units * UNIT_SECONDS - elapsed);

const waitText = (seconds: number) => {
  const m = Math.ceil(seconds / 60);
  if (m < 90) return `about ${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.round(m / 60);
  if (h < 36) return `about ${h} hours`;
  return `about ${Math.round(h / 24)} days`;
};

export class WaitForTime extends Error {
  constructor(public seconds: number, what: string) {
    super(`${what} in ${waitText(seconds)}.`);
  }
}

export class NeedsPreparation extends Error {
  constructor() {
    super('Your Venn key needs one quick self-transfer before a Venn can be created.');
  }
}
