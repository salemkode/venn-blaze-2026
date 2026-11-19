import { describe, expect, it } from 'vitest';
import { p2pkhForPublicKey } from '../../src/core/draft';
import { VAULT } from '../../src/venn/artifact';
import { buildVote, finalizeVote, signFeeInputs, signVenn } from '../../src/venn/build';
import { moneyLocking, vennLocking } from '../../src/venn/contract';
import { ROLE, decodeCardState, encodeCardState } from '../../src/venn/layout';
import { officialCheck } from '../../src/venn/verify';
import { key, utxoFrom } from '../helpers';
import { feeWallet, makeVault, member, people } from './fixtures';
import { binToHex } from '../../src/core/bytes';
import { hash160 } from '../../src/core/crypto';

const { creator, sara, ali } = people;
const VH = ROLE.VOTE | ROLE.HELPER;
const members = [member(creator, VH), member(sara, VH), member(ali, VH)];

describe('venn official check', () => {
  it('real vault is official', () => {
    const v = makeVault({ members });
    const built = buildVote(v.params, v.coins, { add: [member(key(40), VH)] }, feeWallet(creator));
    const approvals = [creator, sara].map(k => ({ publicKey: k.hex, signature: signVenn(built.draft, k.privateKey) }));
    const tx = finalizeVote(built.draft, approvals, signFeeInputs(built.draft, creator.privateKey, creator.publicKey));
    const locks = [binToHex(vennLocking(v.params)), binToHex(moneyLocking(v.params))];
    const utxos = [
      ...v.utxos.filter(u => !tx.inputs.some(i => i.txid === u.txid && i.vout === u.vout)),
      ...tx.outputs.flatMap((o, i) => (locks.includes(binToHex(o.lockingBytecode)) ? [utxoFrom(tx, i, 300)] : [])),
    ];
    const result = officialCheck({ params: v.params, genesis: v.genesis, utxos });
    expect(result.status).toBe('official');
    if (result.status !== 'official') return;
    expect([result.name, result.version, result.fingerprint]).toEqual(['Venn', 2, VAULT.sha256.slice(0, 8)]);
    expect(result.cards).toHaveLength(4);
    expect(result.rules.voters).toBe(4);
  });

  it('vault built from a modified template is not official', () => {
    const v = makeVault({ members });
    const modified = VAULT.template.slice(0, -2) + (VAULT.template.endsWith('68') ? '69' : '68');
    const elsewhere = vennLocking(v.params, modified);
    const utxos = v.utxos.map(u => ({ ...u, lockingBytecode: elsewhere }));
    const result = officialCheck({ params: v.params, genesis: v.genesis, utxos });
    expect(result.status).toBe('not-official');
    if (result.status === 'not-official') expect(result.reason).toMatch(/code/);
  });

  it('extra minting authority at genesis is not official', () => {
    const v = makeVault({ members });
    const genesis = {
      ...v.genesis,
      outputs: v.genesis.outputs.map((o, i) =>
        i === 0 ? { ...o, lockingBytecode: p2pkhForPublicKey(creator.publicKey) } : o,
      ),
    };
    const result = officialCheck({ params: v.params, genesis, utxos: v.utxos });
    expect(result.status).toBe('not-official');
  });

  it('card count mismatch now is not official', () => {
    const v = makeVault({ members });
    const extraCard = {
      ...v.coins.cards[0],
      txid: 'fe'.repeat(32),
      token: {
        ...v.coins.cards[0].token!,
        nft: {
          capability: 'mutable' as const,
          commitment: encodeCardState({
            ...decodeCardState(v.coins.cards[0].token!.nft!.commitment),
            pkh: '66'.repeat(20),
          }),
        },
      },
    };
    const result = officialCheck({ params: v.params, genesis: v.genesis, utxos: [...v.utxos, extraCard] });
    expect(result.status).toBe('not-official');
    if (result.status === 'not-official') expect(result.reason).toMatch(/count/);
  });
});

describe('venn official check: canonical state', () => {
  it('a creation whose rules are not written canonically is not official (it could freeze the Venn)', () => {
    const v = makeVault({ members });
    const hex = v.genesis.outputs[0].token!.nft!.commitment;
    // Recovery flag 2: the decoder reads it as on, the contract can never keep or change it.
    const loose = hex.slice(0, 24) + '02' + hex.slice(26);
    const genesis = {
      ...v.genesis,
      outputs: v.genesis.outputs.map((o, i) =>
        i === 0 ? { ...o, token: { ...o.token!, nft: { capability: 'minting' as const, commitment: loose } } } : o,
      ),
    };
    const result = officialCheck({ params: v.params, genesis, utxos: v.utxos });
    expect(result.status).toBe('not-official');
    if (result.status === 'not-official') expect(result.reason).toMatch(/canonical/);
  });

  it('a vote that gives one key two seats stays official, with a warning members see', () => {
    const v = makeVault({ members });
    const built = buildVote(v.params, v.coins, { add: [member(key(40), VH)] }, feeWallet(creator));
    const i = built.draft.tx.outputs.findIndex(o => o.token?.nft?.commitment.startsWith(binToHex(hash160(key(40).publicKey))));
    const twin = decodeCardState(built.draft.tx.outputs[i].token!.nft!.commitment);
    built.draft.tx.outputs[i] = {
      ...built.draft.tx.outputs[i],
      token: { ...built.draft.tx.outputs[i].token!, nft: { capability: 'mutable', commitment: encodeCardState({ ...twin, pkh: binToHex(hash160(sara.publicKey)) }) } },
    };
    const approvals = [creator, sara].map(k => ({ publicKey: k.hex, signature: signVenn(built.draft, k.privateKey) }));
    const tx = finalizeVote(built.draft, approvals, signFeeInputs(built.draft, creator.privateKey, creator.publicKey));
    const locks = [binToHex(vennLocking(v.params)), binToHex(moneyLocking(v.params))];
    const utxos = [
      ...v.utxos.filter(u => !tx.inputs.some(x => x.txid === u.txid && x.vout === u.vout)),
      ...tx.outputs.flatMap((o, n) => (locks.includes(binToHex(o.lockingBytecode)) ? [utxoFrom(tx, n, 300)] : [])),
    ];
    const result = officialCheck({ params: v.params, genesis: v.genesis, utxos });
    expect(result.status).toBe('official');
    if (result.status === 'official') expect(result.warnings[0]).toMatch(/more than one seat/);
  });
});
