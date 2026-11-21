// A read-only look at a Venn as it stands on chain. Anyone can check it: no wallet, key or
// account is needed, and nothing is signed or sent.
import { MUSD } from './asset';
import { readVenn } from './chain';
import type { VennCoins } from './coins';
import { type VennParams, vennAddress } from './contract';
import { budgetText, money, roleNames } from './summary';

/** The Shared Venn created from the Android app on Mainnet (txid 618c2e9d…), used for judges' checks. */
export const LIVE_MAINNET_VENN: VennParams = {
  network: 'mainnet',
  vaultCategory: '7e1c09b2c0797fe4577b9318b6371d878fe401c49a8ba414eece498f44543136',
  assetCategory: MUSD.category,
};

export interface LiveMember {
  label: string;
  roles: string;
  budget: string;
  recovering: boolean;
}

export interface LiveVenn {
  official: boolean;
  reason: string;
  balance: string;
  address: string;
  members: LiveMember[];
}

/** Turns what the chain holds into plain words. Member names are not on chain, so seats are numbered. */
export function summarizeLiveVenn(
  params: VennParams,
  read: { official: { status: string; reason?: string }; coins: VennCoins | null },
): LiveVenn {
  const unit = params.assetCategory ? MUSD.symbol : 'BCH';
  const cards = read.coins?.cards ?? [];
  const cents = (read.coins?.money ?? []).reduce(
    (sum, coin) => sum + (params.assetCategory ? (coin.token?.category === params.assetCategory ? coin.token.amount : 0n) : coin.value),
    0n,
  );
  return {
    official: read.official.status === 'official',
    reason: read.official.reason ?? '',
    balance: money(cents, unit),
    address: vennAddress(params, true),
    members: cards.map((card, index) => ({
      label: `Member ${index + 1}`,
      roles: roleNames(card.state.roles).join(' · '),
      budget: budgetText({ name: '', ...card.state }, unit),
      recovering: card.state.recovery !== 0,
    })),
  };
}

export async function readLiveVenn(params: VennParams = LIVE_MAINNET_VENN): Promise<LiveVenn> {
  return summarizeLiveVenn(params, await readVenn(params));
}
