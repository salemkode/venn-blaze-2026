// Sorts a Venn's coins into the rules NFT, member cards and money. Money sits at the
// VennMoney address; plain money sent to the Venn address by mistake counts as money too.
import type { Utxo } from '../core/draft';
import { equal } from '../core/bytes';
import { type VennParams, moneyLocking, vennLocking } from './contract';
import { type CardState, type RulesState, decodeCardState, decodeRulesState } from './layout';

export type RulesCoin = Utxo & { state: RulesState };
export type CardCoin = Utxo & { state: CardState };

export interface VennCoins {
  rules: RulesCoin;
  cards: CardCoin[];
  money: Utxo[];
}

/** True for a coin the vault counts as its money (plain BCH, or the asset's fungible tokens). */
export const isMoney = (p: VennParams, u: Utxo): boolean => {
  if (!u.token) return true;
  return !!p.assetCategory && u.token.category === p.assetCategory && !u.token.nft;
};

/** Null when the rules NFT is missing or there is more than one. Undecodable cards are skipped. */
export const vennCoins = (p: VennParams, utxos: Utxo[]): VennCoins | null => {
  const locking = vennLocking(p);
  const moneyLock = moneyLocking(p);
  const mine = utxos.filter(u => equal(u.lockingBytecode, locking) || equal(u.lockingBytecode, moneyLock));
  const rules: RulesCoin[] = [];
  const cards: CardCoin[] = [];
  const money: Utxo[] = [];
  for (const u of mine) {
    const atVault = equal(u.lockingBytecode, locking);
    const nft = atVault && u.token?.category === p.vaultCategory ? u.token.nft : undefined;
    if (nft?.capability === 'minting') {
      try {
        rules.push({ ...u, state: decodeRulesState(nft.commitment) });
      } catch {
        /* not ours to read */
      }
    } else if (nft?.capability === 'mutable') {
      try {
        cards.push({ ...u, state: decodeCardState(nft.commitment) });
      } catch {
        /* not ours to read */
      }
    } else if (isMoney(p, u)) {
      money.push(u);
    }
  }
  if (rules.length !== 1) return null;
  return { rules: rules[0], cards, money };
};
