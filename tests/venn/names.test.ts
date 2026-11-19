import { describe, expect, it } from 'vitest';
import { binToHex } from '../../src/core/bytes';
import { hash160 } from '../../src/core/crypto';
import { inviteFor } from '../../src/venn/invite';
import { trustedNames } from '../../src/venn/names';
import { presetPlan } from '../../src/venn/presets';
import { people } from './fixtures';

const { creator, sara, ali } = people;
const pkhOf = (k: { publicKey: Uint8Array }) => binToHex(hash160(k.publicKey));

describe('names of seats found on-chain', () => {
  const invite = inviteFor(
    presetPlan('shared', { name: 'Alice', publicKey: creator.hex }, [{ name: 'Bob', publicKey: '' }, { name: 'Cara', publicKey: '' }]),
    'chipnet',
  );

  it('names only the creator (key in the invitation) and this wallet’s own seat', () => {
    const names = trustedNames(invite, 2, pkhOf(ali));
    expect(names).toEqual({ [pkhOf(creator)]: 'Alice', [pkhOf(ali)]: 'Cara' });
    // Bob's key is never named from card order, which the creator controls.
    expect(names[pkhOf(sara)]).toBeUndefined();
  });

  it('without a known seat, only the creator is named', () => {
    expect(trustedNames(invite, undefined, pkhOf(sara))).toEqual({ [pkhOf(creator)]: 'Alice' });
  });
});

describe('names saved by older builds', () => {
  it('are reset once, because they may come from a creator-chosen card order', async () => {
    const { migrateNames, NAMES_VERSION } = await import('../../src/venn/store');
    const old = {
      venns: [{ category: 'aa', name: 'Home', type: 'shared' as const, names: { ['11'.repeat(20)]: 'Alice' } }],
      circles: [{ category: 'bb', assetCategory: 'cc', contribution: '1', period: '3600', start: '0', members: [], name: 'C', names: { x: 'Bob' } }],
      proposals: [], preparing: [], joining: [],
    };
    const migrated = migrateNames(old);
    expect(migrated.namesVersion).toBe(NAMES_VERSION);
    expect(migrated.venns[0].names).toEqual({});
    expect(migrated.circles[0].names).toEqual({});
    const fresh = { ...migrated, venns: [{ ...migrated.venns[0], names: { y: 'Cara' } }] };
    expect(migrateNames(fresh).venns[0].names).toEqual({ y: 'Cara' });
  });
});
