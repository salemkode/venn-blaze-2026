// "Try a Venn" with play money: a Personal Venn created, paid from, overspent and closed in the
// browser. Coins are made up, but every transaction is built by the app's real builders for the
// real Venn v2 contract and checked by the real BCH 2026 VM. Nothing is broadcast.
import { binToHex, equal } from '../core/bytes';
import { hash160, publicKeyOf } from '../core/crypto';
import { type Utxo, p2pkhForPublicKey, signPersonal } from '../core/draft';
import { type Output, type Transaction, encodeTransaction, txidOf } from '../core/tx';
import {
  type MemberSpec,
  type RulesSettings,
  buildBudgetSpend,
  buildVennGenesis,
  buildVote,
  finalizeSpend,
  finalizeVote,
  signFeeInputs,
  signVenn,
} from './build';
import { vennCoins, type VennCoins } from './coins';
import { type VennParams, moneyLocking, vennLocking } from './contract';
import { BUDGET, ROLE, decodeCardState, encodeCardState } from './layout';
import { vmVerify } from './vm';

/** Play dollars, in cents, like MUSD. Not a real token. */
export const PLAY_ASSET = 'face'.repeat(16);
export const BUDGET_CENTS = 50n;
export const DEPOSIT_CENTS = 200n;
export const FIRST_PAYMENT = 20n;
export const OVERSPEND = 80n;
/** The rule in contracts/VennVault.cash that refuses the overspend (spend function). */
export const FAILING_RULE = 'require(sent <= available);';
export const FAILING_RULE_LINE = 230;
const NOW = 1_800_000_000n;
const DAY = 86_400n;

type Key = { privateKey: Uint8Array; publicKey: Uint8Array; hex: string };

const randomKey = (): Key => {
  const privateKey = new Uint8Array(32);
  globalThis.crypto.getRandomValues(privateKey);
  privateKey[0] = (privateKey[0] % 0x7f) + 1; // stay well below the curve order
  const publicKey = publicKeyOf(privateKey);
  return { privateKey, publicKey, hex: binToHex(publicKey) };
};

let coinCounter = 1;
const playCoin = (owner: Key, value: bigint, token?: Utxo['token']): Utxo => ({
  txid: binToHex(globalThis.crypto.getRandomValues(new Uint8Array(32))),
  vout: 0,
  value,
  height: coinCounter++,
  lockingBytecode: p2pkhForPublicKey(owner.publicKey),
  ...(token ? { token } : {}),
});

const settings: RulesSettings = {
  membership: 1,
  spending: 1,
  recoveryRule: 1,
  governance: 2,
  payments: 1,
  recoveryOn: true,
  helpersNeeded: 1,
  waitUnits: 1,
  stopRule: 3,
  strongNeeded: 1,
  strongWaitUnits: 2,
} as RulesSettings;

export interface StepResult {
  title: string;
  ok: boolean;
  vm: true | string;
  txid: string;
  bytes: number;
  detail: string;
}

export interface Playground {
  you: Key;
  friend: Key;
  params: VennParams;
  coins: VennCoins;
  utxos: Utxo[];
  balance: bigint;
  available: bigint;
}

const sumAsset = (coins: VennCoins | null) => (coins?.money ?? []).reduce((s, u) => s + (u.token?.amount ?? 0n), 0n);

/** Coins of the Venn after `tx`, as if it had confirmed. */
function after(p: Playground, tx: Transaction): Playground {
  const locks = [binToHex(vennLocking(p.params)), binToHex(moneyLocking(p.params))];
  const txid = txidOf(tx);
  const kept = p.utxos.filter(u => !tx.inputs.some(i => i.txid === u.txid && i.vout === u.vout));
  const fresh: Utxo[] = tx.outputs
    .map((o, vout) => ({ o, vout }))
    .filter(({ o }) => locks.includes(binToHex(o.lockingBytecode)))
    .map(({ o, vout }) => ({ txid, vout, value: o.value, height: coinCounter++, lockingBytecode: o.lockingBytecode, ...(o.token ? { token: o.token } : {}) }));
  const utxos = [...kept, ...fresh];
  const coins = vennCoins(p.params, utxos)!;
  return { ...p, utxos, coins, balance: sumAsset(coins), available: availableOf(coins, p.you) };
}

function availableOf(coins: VennCoins, you: Key) {
  const card = coins.cards.find(c => c.state.pkh === binToHex(hash160(you.publicKey)));
  return card ? card.state.left : 0n;
}

const size = (tx: Transaction) => encodeTransaction(tx).length;

/** Step 1: create a Personal Venn: you spend from a daily budget, a friend helps recover. */
export function createPlayground(): { state: Playground; step: StepResult } {
  const you = randomKey();
  const friend = randomKey();
  const members: MemberSpec[] = [
    { publicKey: you.hex, roles: ROLE.SPEND | ROLE.VOTE | ROLE.HELPER, budgetMode: BUDGET.REFILL, budget: BUDGET_CENTS, period: DAY, cap: 0n },
    { publicKey: friend.hex, roles: ROLE.VOTE | ROLE.HELPER, budgetMode: BUDGET.NONE, budget: 0n, period: 0n, cap: 0n },
  ];
  const fund = playCoin(you, 200_000n);
  const tokens = { ...playCoin(you, 1_000n, { category: PLAY_ASSET, amount: 1_000n }), vout: 1, txid: fund.txid };
  const { params, draft } = buildVennGenesis({
    utxos: [fund],
    publicKey: you.publicKey,
    network: 'mainnet',
    members,
    settings,
    asset: { category: PLAY_ASSET, utxos: [tokens] },
    deposit: DEPOSIT_CENTS,
    gas: 3_000n,
  });
  const tx = signPersonal(draft, you.privateKey, you.publicKey);
  const verdict = vmVerify(tx, draft.sources);
  const base: Playground = { you, friend, params, coins: null as never, utxos: [], balance: 0n, available: 0n };
  const state = after(base, tx);
  return {
    state,
    step: {
      title: 'Create a Personal Venn',
      ok: verdict === true,
      vm: verdict,
      txid: txidOf(tx),
      bytes: size(tx),
      detail: `${money(DEPOSIT_CENTS)} locked in the Venn contract. Your card: up to ${money(BUDGET_CENTS)} a day, refilling.`,
    },
  };
}

const youPay = (p: Playground, amount: bigint) => {
  const index = p.coins.cards.findIndex(c => c.state.pkh === binToHex(hash160(p.you.publicKey)));
  const fee = { utxos: [playCoin(p.you, 100_000n)], publicKey: p.you.publicKey };
  const shop = p2pkhForPublicKey(p.friend.publicKey); // any address; the friend's will do
  return buildBudgetSpend(p.params, p.coins, index, NOW, shop, amount, fee);
};

const sign = (p: Playground, draft: ReturnType<typeof youPay>) => {
  const base = signFeeInputs(draft, p.you.privateKey, p.you.publicKey);
  return finalizeSpend(draft, p.you.hex, signVenn(draft, p.you.privateKey), base);
};

/** Step 2: pay alone, within the budget. */
export function payWithinBudget(p: Playground, amount = FIRST_PAYMENT): { state: Playground; step: StepResult } {
  const draft = youPay(p, amount);
  const tx = sign(p, draft);
  const verdict = vmVerify(tx, draft.sources);
  const state = verdict === true ? after(p, tx) : p;
  return {
    state,
    step: {
      title: `Pay ${money(amount)} alone`,
      ok: verdict === true,
      vm: verdict,
      txid: txidOf(tx),
      bytes: size(tx),
      detail: `Within your budget. ${money(state.available)} left to spend today; ${money(state.balance)} in the Venn.`,
    },
  };
}

/**
 * Step 3: overspend. The app refuses first; then the transaction is forged anyway (paid amount
 * raised past what the card allows, card rewritten to match) and handed to the BCH VM, which
 * refuses it: the contract, not the app, enforces the budget.
 */
export function overspend(p: Playground, amount = OVERSPEND): { appRefusal: string; step: StepResult } {
  let appRefusal = '';
  try {
    youPay(p, amount);
  } catch {
    appRefusal = `The app refuses to sign: ${money(amount)} is more than the ${money(p.available)} left in your budget today.`;
  }
  // Forge: start from a valid payment of everything still available, then take more.
  const draft = youPay(p, p.available);
  const extra = amount - p.available;
  forgeExtra(draft.tx, p.params, extra);
  const tx = sign(p, draft);
  const verdict = vmVerify(tx, draft.sources, false);
  return {
    appRefusal: appRefusal || 'The app did not refuse it.',
    step: {
      title: `Try to pay ${money(amount)} (over the budget)`,
      ok: verdict !== true,
      vm: verdict,
      txid: txidOf(tx),
      bytes: size(tx),
      detail: verdict === true ? 'The VM accepted it. This should never happen.' : `Rejected by the BCH VM at ${FAILING_RULE}`,
    },
  };
}

/** Moves `extra` more units from the Venn's change into the payment, keeping the card consistent. */
function forgeExtra(tx: Transaction, params: VennParams, extra: bigint) {
  const money = moneyLocking(params);
  const change = tx.outputs.findIndex((o, i) => i > 1 && equal(o.lockingBytecode, money) && o.token);
  const pay = tx.outputs[1];
  if (change < 0 || !pay.token) throw new Error('Unexpected payment shape');
  tx.outputs[change] = { ...tx.outputs[change], token: { ...tx.outputs[change].token!, amount: tx.outputs[change].token!.amount - extra } };
  tx.outputs[1] = { ...pay, token: { ...pay.token, amount: pay.token.amount + extra } };
  const card = decodeCardState(tx.outputs[0].token!.nft!.commitment);
  tx.outputs[0] = {
    ...tx.outputs[0],
    token: { ...tx.outputs[0].token!, nft: { capability: 'mutable', commitment: rawLeft(card, card.left - extra) } },
  };
}

/** Card commitment with `left` written exactly as the contract would (script number, 8 bytes). */
function rawLeft(card: ReturnType<typeof decodeCardState>, left: bigint): string {
  const hex = encodeCardState({ ...card, left: 0n });
  const abs = left < 0n ? -left : left;
  const bytes = Array.from({ length: 8 }, (_, i) => Number((abs >> BigInt(8 * i)) & 0xffn));
  if (left < 0n) bytes[7] |= 0x80;
  return hex.slice(0, 92) + bytes.map(b => b.toString(16).padStart(2, '0')).join('') + hex.slice(108);
}

/** Step 4: close and refund: you and your friend vote to pay everything left back to you. */
export function closeAndRefund(p: Playground): { state: Playground; step: StepResult } {
  const amount = p.balance;
  const you = p2pkhForPublicKey(p.you.publicKey);
  const fee = { utxos: [playCoin(p.you, 100_000n)], publicKey: p.you.publicKey };
  const built = buildVote(p.params, p.coins, { payments: [{ to: you, amount }] }, fee);
  const approvals = [p.you, p.friend].map(k => ({ publicKey: k.hex, signature: signVenn(built.draft, k.privateKey) }));
  const base = signFeeInputs(built.draft, p.you.privateKey, p.you.publicKey);
  const tx = finalizeVote(built.draft, approvals, base);
  const verdict = vmVerify(tx, built.draft.sources);
  const state = verdict === true ? after(p, tx) : p;
  return {
    state,
    step: {
      title: `Close and refund ${money(amount)}`,
      ok: verdict === true,
      vm: verdict,
      txid: txidOf(tx),
      bytes: size(tx),
      detail: `${built.need} of 2 voters approved (you and your friend). Everything left went back to your own address; ${money(state.balance)} remains in the Venn.`,
    },
  };
}

export const money = (cents: bigint) => `$${(Number(cents) / 100).toFixed(2)}`;
export type { Output };
