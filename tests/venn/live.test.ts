// The judges' read-only view of a live Venn: plain words from chain data, never a key.
import { expect, it } from 'vitest';
import { MUSD } from '../../src/venn/asset';
import { BUDGET, ROLE } from '../../src/venn/layout';
import { LIVE_MAINNET_VENN, summarizeLiveVenn } from '../../src/venn/live';

const card = (roles: number, budgetMode: number, budget: bigint, recovery: 0 | 1 | 2 = 0) =>
  ({ state: { pkh: '00'.repeat(20), roles, budgetMode, budget, period: 86_400n, cap: 0n, left: budget, last: 0n, recovery } }) as never;
const musd = (amount: bigint) => ({ value: 1_000n, token: { category: MUSD.category, amount } }) as never;

it('summarizes balance, seats and the official check', () => {
  const live = summarizeLiveVenn(LIVE_MAINNET_VENN, {
    official: { status: 'official' },
    coins: {
      rules: {} as never,
      cards: [
        card(ROLE.SPEND | ROLE.VOTE | ROLE.HELPER, BUDGET.REFILL, 5_000n),
        card(ROLE.SPEND | ROLE.VOTE | ROLE.HELPER, BUDGET.REFILL, 20n, 1),
        card(ROLE.VOTE | ROLE.HELPER, BUDGET.NONE, 0n),
      ],
      money: [musd(10n), musd(5n), { value: 9_999n } as never],
    },
  });
  expect(live.official).toBe(true);
  expect(live.balance).toBe('0.15 MUSD');
  expect(live.address).toMatch(/^bitcoincash:r/);
  expect(live.members.map(m => m.label)).toEqual(['Member 1', 'Member 2', 'Member 3']);
  expect(live.members[0]).toMatchObject({ roles: 'spends · votes · helps recover', budget: 'Up to 50.00 MUSD, refilling over a day', recovering: false });
  expect(live.members[1].recovering).toBe(true);
  expect(live.members[2].budget).toBe('No budget: spends only through votes');
});

it('reports a Venn that is not official, or not found', () => {
  const live = summarizeLiveVenn(LIVE_MAINNET_VENN, { official: { status: 'unofficial', reason: 'wrong contract' }, coins: null });
  expect(live).toMatchObject({ official: false, reason: 'wrong contract', balance: '0.00 MUSD', members: [] });
});
