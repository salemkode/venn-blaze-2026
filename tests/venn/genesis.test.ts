import { describe, expect, it } from 'vitest';
import { p2pkhForPublicKey, signPersonal } from '../../src/core/draft';
import { binToHex, fromUtf8 } from '../../src/core/bytes';
import { moneyLocking, vennAddress, vennLocking } from '../../src/venn/contract';
import { buildVennGenesis } from '../../src/venn/build';
import { ROLE, decodeRulesState, encodeRulesState } from '../../src/venn/layout';
import { NotOfficial, verifyGenesis } from '../../src/venn/verify';
import { fakeTxid, vmVerify } from '../helpers';
import { member, people, settings, wallet } from './fixtures';

const { creator, sara, ali } = people;
const members = [
  member(creator, ROLE.SPEND | ROLE.VOTE | ROLE.REQUIRED, { budgetMode: 1, budget: 50_000n, period: 86_400n }),
  member(sara, ROLE.VOTE | ROLE.HELPER),
  member(ali, ROLE.VOTE | ROLE.HELPER),
];

const create = () =>
  buildVennGenesis({
    utxos: [wallet()],
    publicKey: creator.publicKey,
    network: 'chipnet',
    members,
    settings: settings(),
    deposit: 300_000n,
    gas: 3_000n,
  });

describe('venn genesis', () => {
  it('genesis builds and verifies', () => {
    const { params, draft } = create();
    const tx = signPersonal(draft, creator.privateKey, creator.publicKey);
    expect(vmVerify(tx, draft.sources)).toBe(true);
    const { rules, cards } = verifyGenesis(params, tx);
    expect(cards).toHaveLength(3);
    expect([rules.voters, rules.required, rules.helpers]).toEqual([3, 1, 2]);
    expect(cards[0].left).toBe(50_000n);
    expect(params.vaultCategory).toBe(fakeTxid(1));
  });

  it('token vault genesis carries the asset', () => {
    const asset = 'cd'.repeat(32);
    const tokenCoin = { ...wallet(creator, 1_000n, 7, 1), token: { category: asset, amount: 1_000n } };
    const { params, draft } = buildVennGenesis({
      utxos: [wallet()],
      publicKey: creator.publicKey,
      network: 'chipnet',
      members,
      settings: settings(),
      asset: { category: asset, utxos: [tokenCoin] },
      deposit: 600n,
      gas: 3_000n,
    });
    const tx = signPersonal(draft, creator.privateKey, creator.publicKey);
    expect(vmVerify(tx, draft.sources)).toBe(true);
    const deposit = tx.outputs[4];
    expect(deposit.token).toEqual({ category: asset, amount: 600n });
    expect(binToHex(deposit.lockingBytecode)).toBe(binToHex(moneyLocking(params)));
    expect(tx.outputs.some(o => o.token?.category === asset && o.token.amount === 400n)).toBe(true);
    expect(vennAddress(params)).not.toBe(vennAddress({ ...params, assetCategory: undefined }));
  });

  it('minting NFT sent elsewhere is not official', () => {
    const { params, draft } = create();
    draft.tx.outputs[0] = { ...draft.tx.outputs[0], lockingBytecode: p2pkhForPublicKey(creator.publicKey) };
    const tx = signPersonal(draft, creator.privateKey, creator.publicKey);
    expect(() => verifyGenesis(params, tx)).toThrow(NotOfficial);
  });

  it('count mismatch is not official', () => {
    const { params, draft } = create();
    const out = draft.tx.outputs[0];
    const rules = decodeRulesState(out.token!.nft!.commitment);
    draft.tx.outputs[0] = {
      ...out,
      token: { ...out.token!, nft: { capability: 'minting', commitment: encodeRulesState({ ...rules, voters: 4 }) } },
    };
    const tx = signPersonal(draft, creator.privateKey, creator.publicKey);
    expect(() => verifyGenesis(params, tx)).toThrow(NotOfficial);
  });

  it('members get gas and a marker', () => {
    const { params, draft } = create();
    for (const who of [sara, ali]) {
      expect(
        draft.tx.outputs.some(
          o => o.value === 3_000n && binToHex(o.lockingBytecode) === binToHex(p2pkhForPublicKey(who.publicKey)),
        ),
      ).toBe(true);
    }
    const marker = draft.tx.outputs.find(o => o.lockingBytecode[0] === 0x6a)!;
    expect(fromUtf8(marker.lockingBytecode.slice(2, 6))).toBe('VEN2');
    expect(binToHex(marker.lockingBytecode.slice(7))).toBe(params.vaultCategory);
  });

  it('a card created with a recovery key already on it is not official', () => {
    const { params, draft } = create();
    const out = draft.tx.outputs[1];
    const hex = out.token!.nft!.commitment;
    draft.tx.outputs[1] = {
      ...out,
      token: {
        ...out.token!,
        nft: { capability: 'mutable', commitment: hex.slice(0, 126) + '55'.repeat(20) + '0000' },
      },
    };
    const tx = signPersonal(draft, creator.privateKey, creator.publicKey);
    expect(() => verifyGenesis(params, tx)).toThrow(NotOfficial);
  });
});
