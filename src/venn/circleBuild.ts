// Builds Circle transactions: creation, a contribution, and a round's payout. Only the
// person paying the fee signs; the Circle contract itself decides what may happen.
import { type Bytes, binToHex, equal } from '../core/bytes';
import {
  DUST,
  type Draft,
  NeedsPreparation,
  type Utxo,
  contractUnlocking,
  estimateSize,
  FEE_RATE,
  p2pkhForPublicKey,
  settleFee,
  sourceOf,
  spendable,
  sum,
} from '../core/draft';
import { hash160 } from '../core/crypto';
import { encodeScriptNumber } from '../core/script';
import { type Output, SEQUENCE_FINAL, type Transaction } from '../core/tx';
import { CIRCLE, MONEY } from './artifact';
import { COIN_VALUE, type FeeSource, NON_FINAL, payFromWallet } from './build';
import {
  type CircleParams,
  type CircleState,
  FRESH_CIRCLE,
  circleLocking,
  circleMarker,
  circleMoneyLocking,
  decodeCircleState,
  encodeCircleState,
  hasPaid,
  payoutLocking,
  roundDeadline,
  validateCircle,
  verifyCircleGenesis,
} from './circle';
import { officialFor } from './registry';

export type CircleStateCoin = Utxo & { state: CircleState };

export interface CircleCoins {
  state: CircleStateCoin;
  money: Utxo[];
}

/** The Circle's state NFT and its money; null without exactly one readable state NFT. */
export const circleCoins = (p: CircleParams, utxos: Utxo[]): CircleCoins | null => {
  const lock = circleLocking(p);
  const moneyLock = circleMoneyLocking(p);
  const states: CircleStateCoin[] = [];
  const money: Utxo[] = [];
  for (const u of utxos) {
    const atCircle = equal(u.lockingBytecode, lock);
    if (!atCircle && !equal(u.lockingBytecode, moneyLock)) continue;
    if (atCircle && u.token?.category === p.circleCategory) {
      if (u.token.nft?.capability !== 'mutable') continue;
      try {
        states.push({ ...u, state: decodeCircleState(u.token.nft.commitment, p.members.length) });
      } catch {
        /* not ours to read */
      }
    } else if (!u.token || (u.token.category === p.assetCategory && !u.token.nft)) {
      money.push(u);
    }
  }
  if (states.length !== 1) return null;
  return { state: states[0], money };
};

export type CircleOfficial = { status: 'official'; fingerprint: string } | { status: 'not-official'; reason: string };

/** A Circle is official when its contract is on the list, its creation checks out and its state NFT is there. */
export const circleOfficial = (p: CircleParams, genesis: Transaction, coins: CircleCoins | null): CircleOfficial => {
  const entry = officialFor(CIRCLE.sha256);
  if (!entry || entry.name !== 'Circle' || entry.money !== MONEY.sha256)
    return { status: 'not-official', reason: 'this app’s Circle contract is not on the official list' };
  try {
    verifyCircleGenesis(p, genesis);
  } catch (e) {
    return { status: 'not-official', reason: (e as Error).message };
  }
  if (!coins) return { status: 'not-official', reason: 'its state token is missing' };
  return { status: 'official', fingerprint: CIRCLE.sha256.slice(0, 8) };
};

/**
 * Creates a Circle: its state NFT, one small BCH output per member in payout order (for their
 * fees, and so their wallet finds the Circle), and the marker. The Circle category is the txid
 * of input 0's outpoint, which must have index 0. No money moves until the first contribution.
 */
export const buildCircleGenesis = (o: {
  utxos: Utxo[];
  publicKey: Bytes;
  network: CircleParams['network'];
  assetCategory: string;
  /** Key hashes in payout order. */
  members: string[];
  contribution: bigint;
  period: bigint;
  start: bigint;
  gas: bigint;
  plan?: string;
}): { params: CircleParams; draft: Draft } => {
  const self = p2pkhForPublicKey(o.publicKey);
  const own = spendable(o.utxos).filter(u => equal(u.lockingBytecode, self));
  const first = own.find(u => u.vout === 0);
  if (!first) throw new NeedsPreparation();
  if (!o.members.includes(binToHex(hash160(o.publicKey)))) throw new Error('You must be a member of a Circle you create');
  if (o.gas < DUST) throw new Error(`Each member needs at least ${DUST} satoshis for fees`);
  const params: CircleParams = {
    network: o.network,
    circleCategory: first.txid,
    assetCategory: o.assetCategory,
    contribution: o.contribution,
    period: o.period,
    start: o.start,
    members: o.members,
  };
  validateCircle(params);

  const outputs: Output[] = [
    {
      value: COIN_VALUE,
      lockingBytecode: circleLocking(params),
      token: {
        category: params.circleCategory,
        amount: 0n,
        nft: { capability: 'mutable', commitment: encodeCircleState(FRESH_CIRCLE) },
      },
    },
    ...o.members.map(pkh => ({ value: o.gas, lockingBytecode: payoutLocking(pkh) })),
    { value: 0n, lockingBytecode: circleMarker(params, o.plan) },
  ];
  const needed = sum(outputs.map(x => x.value));
  const pool = own.filter(u => u !== first);
  const chosen = [first];
  for (let i = 0; ; i++) {
    const total = sum(chosen.map(u => u.value));
    const draft: Draft = {
      tx: {
        version: 2,
        locktime: 0,
        inputs: chosen.map(u => ({ txid: u.txid, vout: u.vout, sequence: SEQUENCE_FINAL, unlockingBytecode: new Uint8Array() })),
        outputs: [...outputs, { value: 0n, lockingBytecode: self }],
      },
      sources: chosen.map(sourceOf),
      fee: 0n,
      p2pkh: { publicKey: binToHex(o.publicKey) },
    };
    const change = draft.tx.outputs.length - 1;
    settleFee(draft, fee => (draft.tx.outputs[change].value = total - needed - fee > 0n ? total - needed - fee : 0n));
    const left = total - needed - draft.fee;
    if (left >= DUST) {
      draft.tx.outputs[change].value = left;
      return { params, draft };
    }
    if (left >= 0n) {
      draft.tx.outputs.pop();
      if (total - needed >= BigInt(estimateSize(draft)) * FEE_RATE) {
        draft.fee = total - needed;
        return { params, draft };
      }
    }
    if (i >= pool.length) break;
    chosen.push(pool[i]);
  }
  throw new Error('Not enough money in your personal wallet (member fees and network fee)');
};

/** Pays `seat`'s contribution (seat = payout position) from the payer's own tokens. */
export const buildContribute = (
  p: CircleParams,
  coins: CircleCoins,
  seat: number,
  payer: FeeSource,
): Draft => {
  const { state } = coins.state;
  if (state.round >= p.members.length) throw new Error('This Circle has finished');
  if (!Number.isInteger(seat) || seat < 0 || seat >= p.members.length) throw new Error('Unknown seat');
  if (hasPaid(state.paid, seat)) throw new Error('This seat has already paid this round');
  const self = p2pkhForPublicKey(payer.publicKey);
  const tokens = payer.utxos.filter(
    u => equal(u.lockingBytecode, self) && u.token?.category === p.assetCategory && !u.token.nft,
  );
  const picked: Utxo[] = [];
  let have = 0n;
  for (const u of [...tokens].sort((a, b) => (b.token!.amount > a.token!.amount ? 1 : -1))) {
    if (have >= p.contribution) break;
    picked.push(u);
    have += u.token!.amount;
  }
  if (have < p.contribution) throw new Error('You do not hold enough tokens for this contribution');
  const next: CircleState = { ...state, paid: state.paid | (1 << seat) };
  const outputs: Output[] = [
    stateOutput(p, coins.state, next),
    {
      value: COIN_VALUE,
      lockingBytecode: circleMoneyLocking(p),
      token: { category: p.assetCategory, amount: p.contribution },
    },
    ...(have > p.contribution
      ? [{ value: COIN_VALUE, lockingBytecode: self, token: { category: p.assetCategory, amount: have - p.contribution } }]
      : []),
  ];
  return payFromWallet(
    {
      inputs: [
        { utxo: coins.state, sequence: SEQUENCE_FINAL },
        ...picked.map(utxo => ({ utxo, sequence: SEQUENCE_FINAL })),
      ],
      outputs,
      locktime: 0,
    },
    { circle: { params: p, fn: 'contribute', args: [encodeScriptNumber(seat)] } },
    payer,
  );
};

/** When the current round may pay out: now if every seat has paid, otherwise its deadline. */
export const payoutReadyAt = (p: CircleParams, state: CircleState): bigint | null => {
  if (state.round >= p.members.length) return null;
  if (state.paid === 2 ** p.members.length - 1) return 0n;
  return roundDeadline(p, state.round);
};

/**
 * Pays the current round's pot to its member and starts the next round. `now` is the time
 * claim (median time just passed), needed only when someone has not paid.
 */
export const buildPayout = (p: CircleParams, coins: CircleCoins, now: bigint, fee: FeeSource): Draft => {
  const { state } = coins.state;
  const ready = payoutReadyAt(p, state);
  if (ready === null) throw new Error('This Circle has finished');
  const early = ready === 0n;
  if (!early && now < ready) throw new Error('Not everyone has paid, and this round’s deadline has not passed');
  const n = p.members.length;
  const unpaid = 2 ** n - 1 - state.paid;
  const next: CircleState = { round: state.round + 1, paid: 0, missed: state.missed | unpaid };
  const asset = sum(coins.money.map(u => u.token?.amount ?? 0n));
  const bch = sum(coins.money.map(u => u.value));
  const outputs: Output[] = [stateOutput(p, coins.state, next)];
  if (asset > 0n || bch > 0n) {
    const to = payoutLocking(p.members[state.round]);
    outputs.push(
      asset > 0n
        ? { value: bch, lockingBytecode: to, token: { category: p.assetCategory, amount: asset } }
        : { value: bch, lockingBytecode: to },
    );
  }
  return payFromWallet(
    {
      inputs: [
        // The contract reads the locktime, so the lead input is never final (CashScript adds a
        // locktime check to every function that reads it).
        { utxo: coins.state, sequence: NON_FINAL },
        ...coins.money.map(utxo => ({ utxo, sequence: SEQUENCE_FINAL })),
      ],
      outputs,
      locktime: early ? 0 : Number(now),
    },
    { circle: { params: p, fn: 'payout', args: [] } },
    fee,
  );
};

/** After the last round: sends money left at the Circle to the last member in the order. */
export const buildSweep = (p: CircleParams, coins: CircleCoins, fee: FeeSource): Draft => {
  const { state } = coins.state;
  if (state.round < p.members.length) throw new Error('The Circle has rounds left; its money pays out with them');
  if (!coins.money.length) throw new Error('Nothing is left at this Circle');
  const asset = sum(coins.money.map(u => u.token?.amount ?? 0n));
  const bch = sum(coins.money.map(u => u.value));
  const to = payoutLocking(p.members[p.members.length - 1]);
  return payFromWallet(
    {
      inputs: [
        { utxo: coins.state, sequence: SEQUENCE_FINAL },
        ...coins.money.map(utxo => ({ utxo, sequence: SEQUENCE_FINAL })),
      ],
      outputs: [
        stateOutput(p, coins.state, state),
        asset > 0n
          ? { value: bch, lockingBytecode: to, token: { category: p.assetCategory, amount: asset } }
          : { value: bch, lockingBytecode: to },
      ],
      locktime: 0,
    },
    { circle: { params: p, fn: 'sweep', args: [] } },
    fee,
  );
};

const stateOutput = (p: CircleParams, coin: CircleStateCoin, state: CircleState): Output => ({
  value: coin.value,
  lockingBytecode: circleLocking(p),
  token: { category: p.circleCategory, amount: 0n, nft: { capability: 'mutable', commitment: encodeCircleState(state) } },
});

/** Fills every Circle input; fee coins must already be signed (signFeeInputs). */
export const finalizeCircle = (draft: Draft, base: Transaction = draft.tx): Transaction => {
  if (!draft.circle) throw new Error('Not a Circle transaction');
  return {
    ...base,
    inputs: base.inputs.map((input, i) => {
      const unlocking = contractUnlocking(draft, i);
      if (unlocking) return { ...input, unlockingBytecode: unlocking };
      if (input.unlockingBytecode.length === 0) throw new Error('A fee coin has not been signed');
      return input;
    }),
  };
};

export const circleSeatOf = (p: CircleParams, publicKey: Bytes) => p.members.indexOf(binToHex(hash160(publicKey)));
