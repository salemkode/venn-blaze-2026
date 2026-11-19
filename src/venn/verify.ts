// Checks that a vault is exactly what the official contract and its creation say it is.
import type { Utxo } from '../core/draft';
import { equal } from '../core/bytes';
import type { Transaction } from '../core/tx';
import { MONEY, VAULT } from './artifact';
import { countsOf } from './build';
import { vennCoins } from './coins';
import { type VennParams, vennLocking } from './contract';
import { officialFor } from './registry';
import {
  type CardState,
  type RulesState,
  ZERO_HASH160,
  decodeCardState,
  MAX_VOTERS,
  decodeRulesState,
  encodeCardState,
  encodeRulesState,
  validateCard,
  validateRules,
} from './layout';

export class NotOfficial extends Error {
  constructor(reason: string) {
    super(`Not an official Venn: ${reason}`);
  }
}

/** Verifies the transaction that created the vault and returns the state it created. */
export const verifyGenesis = (p: VennParams, genesis: Transaction): { rules: RulesState; cards: CardState[] } => {
  if (genesis.inputs[0]?.txid !== p.vaultCategory || genesis.inputs[0].vout !== 0)
    throw new NotOfficial('this transaction did not create the vault token');
  const locking = vennLocking(p);
  const ours = genesis.outputs.filter(o => o.token?.category === p.vaultCategory);
  let rules: RulesState | undefined;
  const cards: CardState[] = [];
  for (const o of ours) {
    if (!equal(o.lockingBytecode, locking)) throw new NotOfficial('a vault token went to another address');
    const nft = o.token!.nft;
    if (o.token!.amount !== 0n || !nft) throw new NotOfficial('the vault token has the wrong type');
    try {
      if (nft.capability === 'minting') {
        if (rules) throw new NotOfficial('more than one rules token');
        rules = decodeRulesState(nft.commitment);
        // Byte for byte: a value the decoder would read loosely (such as a recovery flag of 2)
        // could freeze a Venn the contract treats differently.
        if (encodeRulesState(rules) !== nft.commitment) throw new NotOfficial('the rules token is not written canonically');
      } else if (nft.capability === 'mutable') {
        const card = decodeCardState(nft.commitment);
        if (encodeCardState(card) !== nft.commitment) throw new NotOfficial('a card is not written canonically');
        cards.push(card);
      } else {
        throw new NotOfficial('the vault token has the wrong type');
      }
    } catch (e) {
      if (e instanceof NotOfficial) throw e;
      throw new NotOfficial('a vault token cannot be read');
    }
  }
  if (!rules) throw new NotOfficial('no rules token');
  try {
    validateRules(rules);
  } catch (e) {
    throw new NotOfficial((e as Error).message);
  }
  checkCounts(rules, cards);
  for (const c of cards) {
    if (c.recovery !== 0 || c.newPkh !== ZERO_HASH160 || c.waitUnits !== 0 || c.left !== c.budget || c.last !== 0n)
      throw new NotOfficial('a card did not start fresh');
    try {
      validateCard(c);
    } catch (e) {
      throw new NotOfficial((e as Error).message);
    }
  }
  if (rules.voters > MAX_VOTERS) throw new NotOfficial('too many voters');
  return { rules, cards };
};

export const checkCounts = (rules: RulesState, cards: CardState[], unique = true): void => {
  if (unique && new Set(cards.map(c => c.pkh)).size !== cards.length) throw new NotOfficial('a member appears twice');
  const counts = countsOf(cards);
  if (counts.voters !== rules.voters || counts.required !== rules.required || counts.helpers !== rules.helpers)
    throw new NotOfficial('the member counts do not match the cards');
};

export type OfficialResult =
  | {
      status: 'official';
      name: string;
      version: number;
      fingerprint: string;
      rules: RulesState;
      cards: CardState[];
      /** Facts members should see, such as one key holding two seats after a vote. */
      warnings: string[];
    }
  | { status: 'not-official'; reason: string };

/**
 * Everything a phone needs to call a vault official: the template is on the official list,
 * the vault's coins sit at the address that template gives, its creation handed out no other
 * authority, and today's rules count exactly today's cards.
 */
export const officialCheck = (o: { params: VennParams; genesis: Transaction; utxos: Utxo[] }): OfficialResult => {
  const entry = officialFor(VAULT.sha256);
  if (entry?.money !== MONEY.sha256)
    return { status: 'not-official', reason: 'this app’s money contract is not on the official list' };
  if (!entry) return { status: 'not-official', reason: 'this app’s contract code is not on the official list' };
  try {
    verifyGenesis(o.params, o.genesis);
    const coins = vennCoins(o.params, o.utxos);
    if (!coins) throw new NotOfficial('its coins are not held by the official contract code');
    const cards = coins.cards.map(c => c.state);
    // Votes can give one key two seats; the contract counts seats, so the app does too.
    checkCounts(coins.rules.state, cards, false);
    const warnings =
      new Set(cards.map(c => c.pkh)).size !== cards.length ? ['One key holds more than one seat, so it counts more than once in votes.'] : [];
    return {
      status: 'official',
      name: entry.name,
      version: entry.version,
      fingerprint: VAULT.sha256.slice(0, 8),
      rules: coins.rules.state,
      cards,
      warnings,
    };
  } catch (e) {
    if (e instanceof NotOfficial)
      return { status: 'not-official', reason: e.message.replace(/^Not an official Venn: /, '') };
    throw e;
  }
};
