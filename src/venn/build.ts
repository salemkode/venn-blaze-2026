// Builds every Venn transaction. Nothing here signs vault inputs on its own: drafts are
// shown to people, signed, then finalised.
import {
  DUST,
  type Draft,
  NeedsPreparation,
  WaitForTime,
  contractUnlocking,
  secondsUntil,
  type Utxo,
  estimateSize,
  FEE_RATE,
  p2pkhForPublicKey,
  settleFee,
  sourceOf,
  spendable,
  sum,
} from '../core/draft';
import { type Bytes, binToHex, concat, equal, hexToBin, utf8 } from '../core/bytes';
import { type Network, p2pkhLockingBytecode } from '../core/cashaddr';
import { hash160, signDigest, verifyDigest } from '../core/crypto';
import { encodeScriptNumber, pushData } from '../core/script';
import { timeLockSequence } from '../core/draft';
import { type Output, SEQUENCE_FINAL, SIGHASH_ALL_UTXOS, type Transaction, signatureDigest } from '../core/tx';
import { availableBudget, voteNeed } from './budget';
import type { CardCoin, VennCoins } from './coins';
import { type VennParams, moneyLocking, vennLocking, vennRedeem } from './contract';
import {
  BUDGET,
  type CardState,
  ROLE,
  type RulesState,
  STOP,
  ZERO_HASH160,
  decodeCardState,
  encodeCardState,
  encodeRulesState,
  validateCard,
  validateRules,
} from './layout';

/** BCH kept on each rules NFT, card and token money coin. */
export const COIN_VALUE = 1000n;
export const MARKER = 'VEN2';

export interface MemberSpec {
  /** Compressed public key, hex. */
  publicKey: string;
  roles: number;
  budgetMode: number;
  budget: bigint;
  period: bigint;
  cap: bigint;
}

export type RulesSettings = Omit<RulesState, 'version' | 'voters' | 'required' | 'helpers'>;

const has = (roles: number, role: number) => (roles & role) === role;

/** The same rules the contract applies to every card a vote writes (see validateCard). */
export const validateMember = (m: MemberSpec): void => {
  if (!/^0[23][0-9a-f]{64}$/.test(m.publicKey)) throw new Error('Invalid member key');
  validateCard(m);
};

export const cardFor = (m: MemberSpec): CardState => ({
  pkh: binToHex(hash160(hexToBin(m.publicKey))),
  roles: m.roles,
  budgetMode: m.budgetMode,
  budget: m.budget,
  period: m.period,
  cap: m.cap,
  left: m.budget,
  last: 0n,
  recovery: 0,
  newPkh: ZERO_HASH160,
  waitUnits: 0,
});

/** Counts that the rules NFT stores, derived from the cards. */
export const countsOf = (cards: CardState[]) => ({
  voters: cards.filter(c => has(c.roles, ROLE.VOTE)).length,
  required: cards.filter(c => has(c.roles, ROLE.REQUIRED)).length,
  helpers: cards.filter(c => has(c.roles, ROLE.HELPER)).length,
});

export const rulesFor = (settings: RulesSettings, cards: CardState[]): RulesState => {
  const rules: RulesState = { version: 1, ...settings, ...countsOf(cards) };
  validateRules(rules);
  return rules;
};

/** OP_RETURN marking a Venn's creation; `plan` is the fingerprint every member accepted. */
export const markerScript = (vaultCategory: string, plan?: string, assetCategory?: string): Bytes =>
  concat(
    Uint8Array.of(0x6a),
    pushData(utf8(MARKER)),
    pushData(hexToBin(vaultCategory)),
    ...(plan || assetCategory ? [pushData(plan ? hexToBin(plan) : new Uint8Array())] : []),
    ...(assetCategory ? [pushData(hexToBin(assetCategory))] : []),
  );

const nftOutput = (
  locking: Bytes,
  category: string,
  capability: 'minting' | 'mutable',
  commitment: string,
): Output => ({
  value: COIN_VALUE,
  lockingBytecode: locking,
  token: { category, amount: 0n, nft: { capability, commitment } },
});

/** Gives a funded Venn key a plain output zero for the genesis category. */
export function buildVennFeePreparation(utxos: Utxo[], publicKey: Bytes) {
  const lockingBytecode = p2pkhForPublicKey(publicKey);
  const coins = spendable(utxos).filter(coin => equal(coin.lockingBytecode, lockingBytecode));
  if (coins.some(coin => coin.vout === 0)) throw new Error('The Venn key already has a fee coin.');
  const [coin] = coins;
  if (!coin) throw new Error('Fund the organizer’s Venn key with BCH for network fees.');
  const output = { lockingBytecode, value: coin.value };
  const draft = settleFee({
    tx: {
      version: 2,
      locktime: 0,
      inputs: [{ txid: coin.txid, vout: coin.vout, sequence: SEQUENCE_FINAL, unlockingBytecode: new Uint8Array() }],
      outputs: [output],
    },
    sources: [sourceOf(coin)],
    fee: 0n,
  }, fee => { output.value = coin.value - fee; });
  if (output.value < DUST) throw new Error('The Venn key needs more BCH for network fees.');
  return draft;
}

/**
 * Moves every plain BCH coin on a Venn key to `to` (for example the wallet's own address), less
 * the network fee. Token coins, such as MUSD and seat cards, stay on the key.
 */
export function buildVennKeySweep(utxos: Utxo[], publicKey: Bytes, to: Bytes) {
  const lockingBytecode = p2pkhForPublicKey(publicKey);
  const coins = spendable(utxos).filter(coin => equal(coin.lockingBytecode, lockingBytecode));
  if (!coins.length) throw new Error('The Venn key has no BCH to move.');
  const total = sum(coins.map(coin => coin.value));
  const output = { lockingBytecode: to, value: total };
  const draft = settleFee({
    tx: {
      version: 2,
      locktime: 0,
      inputs: coins.map(coin => ({ txid: coin.txid, vout: coin.vout, sequence: SEQUENCE_FINAL, unlockingBytecode: new Uint8Array() })),
      outputs: [output],
    },
    sources: coins.map(sourceOf),
    fee: 0n,
  }, fee => { output.value = total - fee; });
  if (output.value < DUST) throw new Error('Too little BCH on the Venn key to move after the network fee.');
  return draft;
}

/**
 * Creates a vault: the rules NFT, one card per member, the first deposit, a small amount of
 * BCH to every other member (for their fees, and so their wallet finds the vault) and a
 * marker. The vault category is the txid of input 0's outpoint, which must have index 0.
 */
export const buildVennGenesis = (o: {
  utxos: Utxo[];
  publicKey: Bytes;
  network: Network;
  /** Token vault: the asset category and the creator's coins of it. Deposit is then in tokens. */
  asset?: { category: string; utxos: Utxo[] };
  members: MemberSpec[];
  settings: RulesSettings;
  deposit: bigint;
  gas: bigint;
  plan?: string;
}): { params: VennParams; draft: Draft } => {
  const self = p2pkhForPublicKey(o.publicKey);
  const own = spendable(o.utxos).filter(u => equal(u.lockingBytecode, self));
  const first = own.find(u => u.vout === 0);
  if (!first) throw new NeedsPreparation();
  if (o.members.length < 1) throw new Error('A vault needs at least one member');
  o.members.forEach(validateMember);
  const cards = o.members.map(cardFor);
  if (new Set(cards.map(c => c.pkh)).size !== cards.length) throw new Error('Each member can appear only once');
  const creatorPkh = binToHex(hash160(o.publicKey));
  if (!cards.some(c => c.pkh === creatorPkh)) throw new Error('You must be a member of a vault you create');
  if (o.deposit <= 0n) throw new Error('Deposit something to create the vault');
  if (o.gas < DUST) throw new Error(`Each member needs at least ${DUST} satoshis for fees`);

  const params: VennParams = {
    network: o.network,
    vaultCategory: first.txid,
    ...(o.asset ? { assetCategory: o.asset.category } : {}),
  };
  const locking = vennLocking(params);
  const money = moneyLocking(params);
  const rules = rulesFor(o.settings, cards);

  const tokenInputs: Utxo[] = [];
  let tokenChange = 0n;
  if (o.asset) {
    const coins = o.asset.utxos.filter(
      u => u.token?.category === o.asset!.category && !u.token.nft && equal(u.lockingBytecode, self),
    );
    let have = 0n;
    for (const c of coins) {
      if (have >= o.deposit) break;
      tokenInputs.push(c);
      have += c.token!.amount;
    }
    if (have < o.deposit) throw new Error('You do not hold that many tokens');
    tokenChange = have - o.deposit;
  }

  const outputs: Output[] = [
    nftOutput(locking, params.vaultCategory, 'minting', encodeRulesState(rules)),
    ...cards.map(c => nftOutput(locking, params.vaultCategory, 'mutable', encodeCardState(c))),
    o.asset
      ? { value: COIN_VALUE, lockingBytecode: money, token: { category: o.asset.category, amount: o.deposit } }
      : { value: o.deposit, lockingBytecode: money },
    ...cards
      .filter(c => c.pkh !== creatorPkh)
      .map(c => ({ value: o.gas, lockingBytecode: p2pkhLockingBytecode(hexToBin(c.pkh)) })),
    { value: 0n, lockingBytecode: markerScript(params.vaultCategory, o.plan, params.assetCategory) },
  ];
  if (tokenChange > 0n)
    outputs.push({
      value: COIN_VALUE,
      lockingBytecode: self,
      token: { category: o.asset!.category, amount: tokenChange },
    });

  const pool = own.filter(u => u !== first);
  const needed = sum(outputs.map(x => x.value)) - sum(tokenInputs.map(u => u.value));
  const assemble = (chosen: Utxo[]): Draft => {
    const inputs = [...chosen, ...tokenInputs];
    return {
      tx: {
        version: 2,
        locktime: 0,
        inputs: inputs.map(u => ({
          txid: u.txid,
          vout: u.vout,
          sequence: SEQUENCE_FINAL,
          unlockingBytecode: new Uint8Array(),
        })),
        outputs: [...outputs, { value: 0n, lockingBytecode: self }],
      },
      sources: inputs.map(sourceOf),
      fee: 0n,
      p2pkh: { publicKey: binToHex(o.publicKey) },
    };
  };
  const chosen = [first];
  for (let i = 0; ; i++) {
    const total = sum(chosen.map(u => u.value));
    const draft = assemble(chosen);
    const change = draft.tx.outputs.length - 1;
    settleFee(draft, fee => (draft.tx.outputs[change].value = total - needed - fee > 0n ? total - needed - fee : 0n));
    const left = total - needed - draft.fee;
    if (left >= DUST) {
      draft.tx.outputs[change].value = left;
      return { params, draft };
    }
    if (left >= 0n) {
      draft.tx.outputs.pop();
      const fee = total - needed;
      if (fee >= BigInt(estimateSize(draft)) * FEE_RATE) {
        draft.fee = fee;
        return { params, draft };
      }
    }
    if (i >= pool.length) break;
    chosen.push(pool[i]);
  }
  throw new Error('Not enough money in your personal wallet (deposit, member fees and network fee)');
};

// ---------------------------------------------------------------------------------------
// Shared pieces for transactions that spend vault coins

/** Placeholder signature and key, the size of the real ones, for fee estimates. */
export const SIG_SLOT = new Uint8Array(73).fill(0x30);
export const KEY_SLOT = new Uint8Array(33).fill(0x02);
export const NON_FINAL = 0xfffffffe;

export interface FeeSource {
  utxos: Utxo[];
  publicKey: Bytes;
}

const isVault = (p: VennParams, u: { lockingBytecode: Bytes }) =>
  equal(u.lockingBytecode, vennLocking(p)) || equal(u.lockingBytecode, moneyLocking(p));

/**
 * Adds the acting person's own coins to pay the fee (and anything else `extra` asks for),
 * with change back to them. `inputs` and `outputs` are the vault part, already complete.
 */
export type DraftContract = Pick<Draft, 'venn' | 'circle'>;

export const payFromWallet = (
  base: { inputs: { utxo: Utxo; sequence: number }[]; outputs: Output[]; locktime: number },
  contract: DraftContract | ((inputCount: number) => DraftContract),
  fee: FeeSource,
  extra = 0n,
): Draft => {
  const contractFor = typeof contract === 'function' ? contract : () => contract;
  const self = p2pkhForPublicKey(fee.publicKey);
  const pool = spendable(fee.utxos).filter(u => equal(u.lockingBytecode, self));
  const vaultIn = sum(base.inputs.map(i => i.utxo.value));
  const outValue = sum(base.outputs.map(o => o.value));
  const needed = outValue - vaultIn + extra;
  const assemble = (chosen: Utxo[]): Draft => ({
    tx: {
      version: 2,
      locktime: base.locktime,
      inputs: [
        ...base.inputs.map(i => ({
          txid: i.utxo.txid,
          vout: i.utxo.vout,
          sequence: i.sequence,
          unlockingBytecode: new Uint8Array(),
        })),
        ...chosen.map(u => ({
          txid: u.txid,
          vout: u.vout,
          sequence: SEQUENCE_FINAL,
          unlockingBytecode: new Uint8Array(),
        })),
      ],
      outputs: [...base.outputs, { value: 0n, lockingBytecode: self }],
    },
    sources: [...base.inputs.map(i => sourceOf(i.utxo)), ...chosen.map(sourceOf)],
    fee: 0n,
    ...contractFor(base.inputs.length + chosen.length),
  });
  const chosen: Utxo[] = [];
  for (let i = 0; ; i++) {
    if (chosen.length) {
      const total = sum(chosen.map(u => u.value));
      const draft = assemble(chosen);
      const change = draft.tx.outputs.length - 1;
      settleFee(draft, f => (draft.tx.outputs[change].value = total - needed - f > 0n ? total - needed - f : 0n));
      const left = total - needed - draft.fee;
      if (left >= DUST) {
        draft.tx.outputs[change].value = left;
        return draft;
      }
      if (left >= 0n) {
        draft.tx.outputs.pop();
        if (total - needed >= BigInt(estimateSize(draft)) * FEE_RATE) {
          draft.fee = total - needed;
          return draft;
        }
      }
    }
    if (i >= pool.length) break;
    chosen.push(pool[i]);
  }
  throw new Error('Not enough BCH in your own wallet to pay the network fee');
};

/** Picks vault money covering `amount` of the asset (tokens, or satoshis for a BCH vault). */
export const pickMoney = (
  p: VennParams,
  money: Utxo[],
  amount: bigint,
): { coins: Utxo[]; asset: bigint; bch: bigint } => {
  const assetOf = (u: Utxo) => (p.assetCategory ? u.token?.amount ?? 0n : u.value);
  const sorted = [...money].sort((a, b) => (assetOf(b) > assetOf(a) ? 1 : -1));
  const coins: Utxo[] = [];
  let asset = 0n;
  for (const u of sorted) {
    if (asset >= amount && (p.assetCategory || asset - amount === 0n || asset - amount >= DUST)) break;
    coins.push(u);
    asset += assetOf(u);
  }
  if (asset < amount) throw new Error('The vault does not hold that much');
  if (!p.assetCategory && asset > amount && asset - amount < DUST)
    throw new Error(`The vault would be left with less than ${DUST} satoshis in a coin`);
  return { coins, asset, bch: sum(coins.map(u => u.value)) };
};

/**
 * Money going back to the money address after `sent` leaves. `released` is BCH from cards a
 * vote burns, which the contract counts as Venn money too.
 */
export const vaultChange = (
  p: VennParams,
  picked: { asset: bigint; bch: bigint },
  sent: bigint,
  released = 0n,
): Output[] => {
  const locking = moneyLocking(p);
  const rest = picked.asset - sent;
  if (!p.assetCategory) return rest + released > 0n ? [{ value: rest + released, lockingBytecode: locking }] : [];
  if (picked.bch + released === 0n) return [];
  return [
    {
      value: picked.bch + released,
      lockingBytecode: locking,
      ...(rest > 0n ? { token: { category: p.assetCategory, amount: rest } } : {}),
    },
  ];
};

/** A payment of `amount` of the vault's asset to `to`. */
export const paymentOutput = (p: VennParams, to: Bytes, amount: bigint): Output =>
  p.assetCategory
    ? { value: COIN_VALUE, lockingBytecode: to, token: { category: p.assetCategory, amount } }
    : { value: amount, lockingBytecode: to };

export const cardOutput = (p: VennParams, card: CardCoin, state: CardState): Output => ({
  value: card.value,
  lockingBytecode: vennLocking(p),
  token: { category: p.vaultCategory, amount: 0n, nft: { capability: 'mutable', commitment: encodeCardState(state) } },
});

// ---------------------------------------------------------------------------------------
// Budget spend

/** A member pays `amount` alone from their budget. `now` is the time claim, in seconds. */
export const buildBudgetSpend = (
  p: VennParams,
  coins: VennCoins,
  cardIndex: number,
  now: bigint,
  to: Bytes,
  amount: bigint,
  fee: FeeSource,
): Draft => {
  const card = coins.cards[cardIndex];
  if (!card) throw new Error('Unknown member card');
  const c = card.state;
  if (!has(c.roles, ROLE.SPEND) || c.budgetMode === BUDGET.NONE) throw new Error('This member cannot spend alone');
  if (c.recovery !== 0) throw new Error('This card has a recovery request waiting');
  if (amount <= 0n) throw new Error('Enter an amount');
  if (isVault(p, { lockingBytecode: to })) throw new Error('That is the vault itself');
  const { available, nextLast } = availableBudget(c, now);
  if (amount > available) throw new Error(`That is more than the ${available} left in this budget`);
  if (c.cap > 0n && amount > c.cap) throw new Error(`The most for a single payment is ${c.cap}`);
  const picked = pickMoney(p, coins.money, amount);
  const next: CardState = { ...c, left: available - amount, last: nextLast };
  const outputs = [cardOutput(p, card, next), paymentOutput(p, to, amount), ...vaultChange(p, picked, amount)];
  return payFromWallet(
    {
      inputs: [{ utxo: card, sequence: NON_FINAL }, ...picked.coins.map(utxo => ({ utxo, sequence: SEQUENCE_FINAL }))],
      outputs,
      locktime: Number(now),
    },
    { venn: { params: p, fn: 'spend', lead: [KEY_SLOT, SIG_SLOT] } },
    fee,
  );
};

// ---------------------------------------------------------------------------------------
// Signing and finalising

/** Signature over input 0, the lead: it commits to every input and output. */
export const vennDigest = (draft: Draft): Bytes => {
  if (!draft.venn) throw new Error('Not a Venn transaction');
  return signatureDigest(draft.tx, draft.sources, 0, vennRedeem(draft.venn.params));
};

export const signVenn = (draft: Draft, privateKey: Bytes): Bytes =>
  concat(signDigest(vennDigest(draft), privateKey), Uint8Array.of(SIGHASH_ALL_UTXOS));

export const checkVennSignature = (draft: Draft, signature: Bytes, publicKey: string): boolean =>
  signature.length > 8 &&
  signature[signature.length - 1] === SIGHASH_ALL_UTXOS &&
  verifyDigest(signature.slice(0, -1), vennDigest(draft), hexToBin(publicKey));

/** Signs the acting person's own (P2PKH) inputs; vault inputs are left for finalising. */
export const signFeeInputs = (draft: Draft, privateKey: Bytes, publicKey: Bytes): Transaction => {
  const self = p2pkhForPublicKey(publicKey);
  return {
    ...draft.tx,
    inputs: draft.tx.inputs.map((input, i) => {
      if (!equal(draft.sources[i].lockingBytecode, self)) return input;
      const sig = concat(
        signDigest(signatureDigest(draft.tx, draft.sources, i, self), privateKey),
        Uint8Array.of(SIGHASH_ALL_UTXOS),
      );
      return { ...input, unlockingBytecode: concat(pushData(sig), pushData(publicKey)) };
    }),
  };
};

/** Fills every contract input: the lead with `lead`, Venn inputs with follow, money coins with VennMoney. */
export const finalizeVenn = (draft: Draft, lead: Bytes[], base: Transaction = draft.tx): Transaction => {
  if (!draft.venn) throw new Error('Not a Venn transaction');
  return {
    ...base,
    inputs: base.inputs.map((input, i) => {
      const unlocking = contractUnlocking(draft, i, lead);
      if (unlocking) return { ...input, unlockingBytecode: unlocking };
      if (input.unlockingBytecode.length === 0) throw new Error('A fee coin has not been signed');
      return input;
    }),
  };
};

export const finalizeSpend = (draft: Draft, publicKey: string, signature: Bytes, base?: Transaction): Transaction =>
  finalizeVenn(draft, [hexToBin(publicKey), signature], base);

// ---------------------------------------------------------------------------------------
// Votes

export type Category = 'membership' | 'spending' | 'recovery' | 'governance' | 'payments';

export interface CardUpdate {
  pkh: string;
  roles?: number;
  budgetMode?: number;
  budget?: bigint;
  period?: bigint;
  cap?: bigint;
}

export interface VoteChange {
  add?: MemberSpec[];
  /** Key hashes of members to remove. */
  remove?: string[];
  update?: CardUpdate[];
  settings?: Partial<RulesSettings>;
  payments?: { to: Bytes; amount: bigint }[];
}

/** Room in a signature entry: index, key, length byte and a DER signature. */
const APPROVAL_SLOT = 1 + 33 + 1 + 73;
const BUDGET_FIELDS = ['budgetMode', 'budget', 'period', 'cap'] as const;
const roleBit = (roles: number, role: number) => (has(roles, role) ? 1 : 0);

/** Signatures needed for the categories touched, under the rules in force before the vote. */
export const needFor = (rules: RulesState, touched: Category[]): number => {
  const ruleOf: Record<Category, number> = {
    membership: rules.membership,
    spending: rules.spending,
    recovery: rules.recoveryRule,
    governance: rules.governance,
    payments: rules.payments,
  };
  let need = 0;
  for (const c of touched) {
    const n = voteNeed(ruleOf[c], rules.voters);
    if (n === null) throw new Error(`${c[0].toUpperCase()}${c.slice(1)} is locked in this vault and cannot change`);
    need = Math.max(need, n);
  }
  return need;
};

/** Cards that may join a transaction they do not lead: none with a recovery waiting. */
const settled = (c: CardCoin) => c.state.recovery === 0;

/**
 * Builds a vote. Every settled voting card is an input so any voter can sign; cards being
 * removed or changed are inputs too. The proposer's own coins pay the fee. `need` is how many
 * approvals the final transaction carries: the strictest rule touched, and never fewer than
 * the required members, who must all sign.
 */
export const buildVote = (
  p: VennParams,
  coins: VennCoins,
  change: VoteChange,
  fee: FeeSource,
): { draft: Draft; need: number; requiredPkhs: string[]; touched: Category[] } => {
  const rules = coins.rules.state;
  const touched = new Set<Category>();
  const removing = new Set(change.remove ?? []);
  const updates = new Map((change.update ?? []).map(u => [u.pkh, u]));
  for (const pkh of [...removing, ...updates.keys()])
    if (!coins.cards.some(c => c.state.pkh === pkh)) throw new Error('That person is not a member of this vault');
  for (const pkh of updates.keys()) {
    if (removing.has(pkh)) throw new Error('A member cannot be changed and removed in the same vote');
    if (!settled(findCard(coins, pkh))) throw new Error('That member has a recovery waiting; settle it first');
  }

  const added = (change.add ?? []).map(m => {
    validateMember(m);
    return cardFor(m);
  });
  // A vote may not give a key a second seat. A key that already holds two (an earlier vote
  // can make that happen; the contract counts seats) keeps working.
  const staying = new Set(coins.cards.filter(c => !removing.has(c.state.pkh)).map(c => c.state.pkh));
  const addedPkhs = added.map(c => c.pkh);
  if (new Set(addedPkhs).size !== addedPkhs.length || addedPkhs.some(pkh => staying.has(pkh)))
    throw new Error('Each member can appear only once');

  const involved = coins.cards.filter(
    c => (has(c.state.roles, ROLE.VOTE) && settled(c)) || removing.has(c.state.pkh) || updates.has(c.state.pkh),
  );
  const kept: { coin: CardCoin; next: CardState }[] = [];
  const plan: number[] = [];
  let released = 0n;
  for (const coin of involved) {
    const c = coin.state;
    if (removing.has(c.pkh)) {
      touched.add('membership');
      if (has(c.roles, ROLE.HELPER)) touched.add('recovery');
      released += coin.value;
      plan.push(1);
      continue;
    }
    const u = updates.get(c.pkh);
    let next = c;
    if (u) {
      const roles = u.roles ?? c.roles;
      const spec: MemberSpec = {
        publicKey: '02' + '00'.repeat(32),
        roles,
        budgetMode: u.budgetMode ?? c.budgetMode,
        budget: u.budget ?? c.budget,
        period: u.period ?? c.period,
        cap: u.cap ?? c.cap,
      };
      validateMember(spec);
      next = { ...c, roles, budgetMode: spec.budgetMode, budget: spec.budget, period: spec.period, cap: spec.cap };
      if (roles % 8 !== c.roles % 8) touched.add('membership');
      if (roleBit(roles, ROLE.SPEND) !== roleBit(c.roles, ROLE.SPEND)) touched.add('spending');
      if (roleBit(roles, ROLE.HELPER) !== roleBit(c.roles, ROLE.HELPER)) touched.add('recovery');
      if (BUDGET_FIELDS.some(f => next[f] !== c[f])) {
        touched.add('spending');
        next = { ...next, left: next.budget };
      }
    }
    kept.push({ coin, next });
    plan.push(0);
  }
  if (added.length) touched.add('membership');
  // A new member who spends alone receives a budget: that is a spending change too.
  if (added.some(c => has(c.roles, ROLE.SPEND))) touched.add('spending');
  if (added.some(c => has(c.roles, ROLE.HELPER))) touched.add('recovery');

  const finalCards = [
    ...coins.cards.filter(c => !involved.includes(c)).map(c => c.state),
    ...kept.map(k => k.next),
    ...added,
  ];
  const settings = { ...rules, ...change.settings };
  const nextRules = rulesFor(
    {
      membership: settings.membership,
      spending: settings.spending,
      recoveryRule: settings.recoveryRule,
      governance: settings.governance,
      payments: settings.payments,
      recoveryOn: settings.recoveryOn,
      helpersNeeded: settings.helpersNeeded,
      waitUnits: settings.waitUnits,
      stopRule: settings.stopRule,
      strongNeeded: settings.strongNeeded,
      strongWaitUnits: settings.strongWaitUnits,
    },
    finalCards,
  );
  const rulesHex = encodeRulesState(nextRules);
  const oldHex = encodeRulesState(rules);
  if (rulesHex.slice(8, 18) !== oldHex.slice(8, 18)) touched.add('governance');
  if (rulesHex.slice(24, 40) !== oldHex.slice(24, 40)) touched.add('recovery');

  const payments = change.payments ?? [];
  const total = sum(payments.map(x => x.amount));
  if (payments.some(x => x.amount <= 0n)) throw new Error('Enter an amount for every payment');
  if (payments.some(x => isVault(p, { lockingBytecode: x.to }))) throw new Error('A payment cannot go to the Venn itself');
  if (total > 0n) touched.add('payments');
  const picked = total > 0n ? pickMoney(p, coins.money, total) : { coins: [] as Utxo[], asset: 0n, bch: 0n };

  const order: Category[] = ['membership', 'spending', 'recovery', 'governance', 'payments'];
  const list = order.filter(c => touched.has(c));
  if (!list.length) throw new Error('This proposal changes nothing');
  const requiredPkhs = coins.cards.filter(c => has(c.state.roles, ROLE.REQUIRED)).map(c => c.state.pkh);
  const need = Math.max(needFor(rules, list), rules.required);
  const signable = involved.filter(c => has(c.state.roles, ROLE.VOTE));
  if (signable.length < need) throw new Error('Not enough voters can sign right now: a recovery is waiting');
  if (requiredPkhs.some(pkh => !signable.some(c => c.state.pkh === pkh)))
    throw new Error('A required member has a recovery waiting; settle it before voting');

  const locking = vennLocking(p);
  const outputs: Output[] = [
    {
      value: coins.rules.value,
      lockingBytecode: locking,
      token: { category: p.vaultCategory, amount: 0n, nft: { capability: 'minting', commitment: rulesHex } },
    },
    ...kept.map(k => cardOutput(p, k.coin, k.next)),
    ...added.map(c => nftCard(p, c)),
    ...payments.map(x => paymentOutput(p, x.to, x.amount)),
    ...vaultChange(p, picked, total, released),
  ];
  const inputs = [
    { utxo: coins.rules as Utxo, sequence: SEQUENCE_FINAL },
    ...involved.map(utxo => ({ utxo: utxo as Utxo, sequence: SEQUENCE_FINAL })),
    ...picked.coins.map(utxo => ({ utxo, sequence: SEQUENCE_FINAL })),
  ];
  // One plan byte per input after the rules: 1 burns a card; every other input gets 0.
  const planFor = (inputCount: number) => Uint8Array.from({ length: inputCount - 1 }, (_, i) => plan[i] ?? 0);
  const draft = payFromWallet(
    { inputs, outputs, locktime: 0 },
    n => ({ venn: { params: p, fn: 'vote', lead: [new Uint8Array(APPROVAL_SLOT * need), planFor(n)] } }),
    fee,
  );
  return { draft, need, requiredPkhs, touched: list };
};

const nftCard = (p: VennParams, c: CardState): Output => ({
  value: COIN_VALUE,
  lockingBytecode: vennLocking(p),
  token: { category: p.vaultCategory, amount: 0n, nft: { capability: 'mutable', commitment: encodeCardState(c) } },
});

export interface Approval {
  publicKey: string;
  signature: Bytes;
}

/**
 * The approvals list the contract reads: exactly `need` signers, ordered by their card's
 * input index. Seats holding the required role are taken first.
 * Throws when too few valid approvals are given.
 */
export const approvalsBlob = (draft: Draft, approvals: Approval[], need: number): Bytes => {
  if (!draft.venn) throw new Error('Not a Venn transaction');
  const { fn, params } = draft.venn;
  // Recovery requests are approved by helpers, everything else by voters; neither ever counts
  // the seat a recovery request or stop vote is about (input 1).
  const role = fn === 'recoveryRequest' ? ROLE.HELPER : ROLE.VOTE;
  const skip = fn === 'recoveryRequest' || fn === 'recoveryCancelByVote' ? 1 : 0;
  const signerCard = (i: number) => {
    const t = draft.sources[i].token;
    if (i < 1 || i === skip || !equal(draft.sources[i].lockingBytecode, vennLocking(params))) return null;
    if (t?.category !== params.vaultCategory || t.nft?.capability !== 'mutable') return null;
    try {
      const card = decodeCardState(t.nft.commitment);
      return card.recovery === 0 && has(card.roles, role) ? card : null;
    } catch {
      return null;
    }
  };
  const entries: { index: number; required: boolean; bytes: Bytes }[] = [];
  for (const a of approvals) {
    const pkh = binToHex(hash160(hexToBin(a.publicKey)));
    // A key holding several seats approves with each of them: the contract counts seats.
    const indexes = draft.sources.map((_, i) => i).filter(i => signerCard(i)?.pkh === pkh);
    if (!indexes.length) throw new Error('That person has no seat that can approve this transaction');
    if (!checkVennSignature(draft, a.signature, a.publicKey)) throw new Error('An approval does not match this proposal');
    for (const index of indexes) {
      if (entries.some(e => e.index === index)) continue;
      entries.push({
        index,
        // The contract counts required seats, not keys: a key may hold one of each.
        required: has(signerCard(index)!.roles, ROLE.REQUIRED),
        bytes: concat(Uint8Array.of(index), hexToBin(a.publicKey), Uint8Array.of(a.signature.length), a.signature),
      });
    }
  }
  if (entries.length < need) throw new Error(`${need} approvals are needed, ${entries.length} given`);
  const chosen = [...entries.filter(e => e.required), ...entries.filter(e => !e.required)].slice(0, need);
  chosen.sort((a, b) => a.index - b.index);
  return concat(...chosen.map(e => e.bytes));
};

/** Approvals a vote's draft carries room for. */
export const approvalsNeeded = (draft: Draft) => Math.floor(draft.venn!.lead[0].length / APPROVAL_SLOT);

export const finalizeVote = (
  draft: Draft,
  approvals: Approval[],
  base?: Transaction,
): Transaction => {
  const lead = draft.venn!.lead;
  return finalizeVenn(draft, [approvalsBlob(draft, approvals, approvalsNeeded(draft)), lead[1]], base);
};

// ---------------------------------------------------------------------------------------
// Recovery

const findCard = (coins: VennCoins, pkh: string): CardCoin => {
  const card = coins.cards.find(c => c.state.pkh === pkh);
  if (!card) throw new Error('That person is not a member of this vault');
  return card;
};

/** Rules first, then cards coming back unchanged at the same index except `changed`. */
const cardsInPlace = (
  p: VennParams,
  coins: VennCoins,
  cards: CardCoin[],
  changed: Map<CardCoin, CardState>,
): { inputs: { utxo: Utxo; sequence: number }[]; outputs: Output[] } => ({
  inputs: [
    { utxo: coins.rules, sequence: SEQUENCE_FINAL },
    ...cards.map(utxo => ({ utxo: utxo as Utxo, sequence: SEQUENCE_FINAL })),
  ],
  outputs: [
    { value: coins.rules.value, lockingBytecode: vennLocking(p), token: coins.rules.token },
    ...cards.map(c => cardOutput(p, c, changed.get(c) ?? c.state)),
  ],
});

/**
 * Helpers ask to replace `target`'s key with `newPublicKey`. Every settled helper card other
 * than the target is included so any of them can approve. `strong` is stop rule C's longer path.
 */
export const buildRecoveryRequest = (
  p: VennParams,
  coins: VennCoins,
  target: string,
  newPublicKey: string,
  strong: boolean,
  fee: FeeSource,
): { draft: Draft; need: number } => {
  const rules = coins.rules.state;
  if (!rules.recoveryOn) throw new Error('Recovery is off in this vault');
  if (strong && rules.stopRule !== STOP.BOTH) throw new Error('This vault has no strong recovery path');
  const card = findCard(coins, target);
  if (card.state.recovery !== 0) throw new Error('A recovery request is already waiting for this card');
  if (!/^0[23][0-9a-f]{64}$/.test(newPublicKey)) throw new Error('Invalid new key');
  const newPkh = binToHex(hash160(hexToBin(newPublicKey)));
  if (newPkh === target) throw new Error('That is the same key');
  if (coins.cards.some(c => c.state.pkh === newPkh)) throw new Error('That key already belongs to a member');
  const helpers = coins.cards.filter(c => c !== card && has(c.state.roles, ROLE.HELPER) && settled(c));
  const need = strong ? rules.strongNeeded : rules.helpersNeeded;
  if (helpers.length < need) throw new Error('This vault does not have enough helpers available');
  const next: CardState = {
    ...card.state,
    recovery: strong || rules.stopRule === STOP.VOTERS ? 2 : 1,
    newPkh,
    waitUnits: strong ? rules.strongWaitUnits : rules.waitUnits,
  };
  const cards = [card, ...helpers];
  const base = cardsInPlace(p, coins, cards, new Map([[card, next]]));
  const draft = payFromWallet(
    { ...base, locktime: 0 },
    {
      venn: {
        params: p,
        fn: 'recoveryRequest',
        lead: [new Uint8Array(APPROVAL_SLOT * need), scriptNumber(1), hexToBin(newPkh), scriptNumber(strong ? 1 : 0)],
      },
    },
    fee,
  );
  return { draft, need };
};

/** The new key takes over after the wait. `elapsed` is median time since the card's request confirmed. */
export const buildRecoveryComplete = (
  p: VennParams,
  coins: VennCoins,
  target: string,
  elapsed: number,
  fee: FeeSource,
): Draft => {
  const card = findCard(coins, target);
  if (card.state.recovery === 0) throw new Error('No recovery request is waiting for this card');
  const left = secondsUntil(card.state.waitUnits, elapsed);
  if (left > 0) throw new WaitForTime(left, 'The new key can take over');
  const next: CardState = { ...card.state, pkh: card.state.newPkh, recovery: 0, newPkh: ZERO_HASH160, waitUnits: 0 };
  return payFromWallet(
    {
      inputs: [{ utxo: card, sequence: timeLockSequence(card.state.waitUnits) }],
      outputs: [cardOutput(p, card, next)],
      locktime: 0,
    },
    { venn: { params: p, fn: 'recoveryComplete', lead: [KEY_SLOT, SIG_SLOT] } },
    fee,
  );
};

/** The current key stops a request it may stop. */
export const buildRecoveryCancelByKey = (p: VennParams, coins: VennCoins, target: string, fee: FeeSource): Draft => {
  const card = findCard(coins, target);
  if (card.state.recovery === 0) throw new Error('No recovery request is waiting for this card');
  if (card.state.recovery !== 1)
    throw new Error('Under this vault’s rules your key cannot stop this request; the members can');
  const next: CardState = { ...card.state, recovery: 0, newPkh: ZERO_HASH160, waitUnits: 0 };
  return payFromWallet(
    { inputs: [{ utxo: card, sequence: SEQUENCE_FINAL }], outputs: [cardOutput(p, card, next)], locktime: 0 },
    { venn: { params: p, fn: 'recoveryCancelByKey', lead: [KEY_SLOT, SIG_SLOT] } },
    fee,
  );
};

/** A majority of voters stops a request (stop rules B and C). */
export const buildRecoveryCancelByVote = (
  p: VennParams,
  coins: VennCoins,
  target: string,
  fee: FeeSource,
): { draft: Draft; need: number } => {
  const rules = coins.rules.state;
  if (rules.stopRule === STOP.KEY)
    throw new Error('Under stop rule A only the card’s own key can stop a request; members cannot');
  const card = findCard(coins, target);
  if (card.state.recovery === 0) throw new Error('No recovery request is waiting for this card');
  const voters = coins.cards.filter(c => c !== card && has(c.state.roles, ROLE.VOTE) && settled(c));
  const need = Math.floor(rules.voters / 2) + 1;
  if (voters.length < need) throw new Error('Not enough other voters to stop this request');
  const base = cardsInPlace(
    p,
    coins,
    [card, ...voters],
    new Map([[card, { ...card.state, recovery: 0, newPkh: ZERO_HASH160, waitUnits: 0 }]]),
  );
  const draft = payFromWallet(
    { ...base, locktime: 0 },
    { venn: { params: p, fn: 'recoveryCancelByVote', lead: [new Uint8Array(APPROVAL_SLOT * need), scriptNumber(1)] } },
    fee,
  );
  return { draft, need };
};

const scriptNumber = (n: number): Bytes => encodeScriptNumber(n);

/**
 * Finalises any Venn transaction: a list of approvals (votes, recovery requests and
 * cancellations by vote) or one key's signature (completion, cancellation by key).
 */
export const finalizeRecovery = (
  draft: Draft,
  approvals: Approval[] | Approval,
  base?: Transaction,
): Transaction => {
  const lead = draft.venn!.lead;
  if (!Array.isArray(approvals)) return finalizeVenn(draft, [hexToBin(approvals.publicKey), approvals.signature], base);
  return finalizeVenn(draft, [approvalsBlob(draft, approvals, approvalsNeeded(draft)), ...lead.slice(1)], base);
};
