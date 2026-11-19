// Group decisions travel as codes: the proposer's draft, each approver's signature, and the
// final transaction the proposer sends. Every final transaction is checked by the real VM.
import { describe, expect, it } from 'vitest';
import { binToHex, hexToBin } from '../../src/core/bytes';
import { hash160 } from '../../src/core/crypto';
import { p2pkhForPublicKey } from '../../src/core/draft';
import {
  buildRecoveryCancelByVote,
  buildRecoveryRequest,
  buildVote,
  finalizeRecovery,
  finalizeVote,
  signFeeInputs,
  signVenn,
} from '../../src/venn/build';
import { vennCoins } from '../../src/venn/coins';
import { moneyLocking, vennLocking } from '../../src/venn/contract';
import { ROLE, STOP } from '../../src/venn/layout';
import {
  approvalFor,
  checkApproval,
  decodeApproval,
  decodeKeyCode,
  decodeProposal,
  decodeVennCode,
  describeProposal,
  draftOf,
  encodeApproval,
  encodeKeyCode,
  encodeProposal,
  encodeVennCode,
  proposalFor,
} from '../../src/venn/proposal';
import { key, utxoFrom, vmVerify } from '../helpers';
import { feeWallet, makeVault, member, people } from './fixtures';

const { creator, sara, ali, omar, newPhone, shop } = people;
const VH = ROLE.VOTE | ROLE.HELPER;
const pkhOf = (k: { publicKey: Uint8Array }) => binToHex(hash160(k.publicKey));
const money = (n: bigint) => `${n}`;
type Key = ReturnType<typeof key>;

const vault = () =>
  makeVault({
    members: [member(creator, VH | ROLE.REQUIRED), member(sara, VH), member(ali, VH), member(omar, VH)],
    settings: { stopRule: STOP.BOTH, helpersNeeded: 2, waitUnits: 2, strongNeeded: 3, strongWaitUnits: 4 },
  });
const names = { [pkhOf(creator)]: 'Creator', [pkhOf(sara)]: 'Sara', [pkhOf(ali)]: 'Ali', [pkhOf(omar)]: 'Omar' };

/** What each approver does: decode the code, read it, sign, return an approval code. */
const approve = (code: string, who: Key) => {
  const proposal = decodeProposal(code);
  return encodeApproval(approvalFor(proposal, who.hex, signVenn(draftOf(proposal), who.privateKey)));
};

describe('proposal codes', () => {
  it('a payment vote: proposed, described, approved by codes and sent', () => {
    const v = vault();
    const to = p2pkhForPublicKey(shop.publicKey);
    const built = buildVote(v.params, v.coins, { payments: [{ to, amount: 120_000n }] }, feeWallet(sara));
    const code = encodeProposal(proposalFor('vote', built.draft, 'Pay the shop', built.need, built.requiredPkhs));
    const proposal = decodeProposal(code);
    const described = describeProposal(proposal, v.coins, names, money, 'chipnet');
    expect(described.lines).toEqual([expect.stringMatching(/^Pay 120000 to bchtest:/)]);
    expect(described.signers.sort()).toEqual([creator, sara, ali, omar].map(pkhOf).sort());

    const approvals = [approve(code, sara), approve(code, creator), approve(code, ali)].map(decodeApproval);
    for (const a of approvals) expect(checkApproval(proposal, a)).toBe(true);
    const draft = draftOf(proposal);
    const tx = finalizeVote(
      draft,
      approvals.map(a => ({ publicKey: a.publicKey, signature: hexToBin(a.signature) })),
      signFeeInputs(draft, sara.privateKey, sara.publicKey),
    );
    expect(vmVerify(tx, draft.sources)).toBe(true);
  });

  it('an approval for another proposal, or by someone else, does not check out', () => {
    const v = vault();
    const one = buildVote(v.params, v.coins, { add: [member(key(50), VH)] }, feeWallet(sara));
    const two = buildVote(v.params, v.coins, { add: [member(key(51), VH)] }, feeWallet(sara));
    const p1 = proposalFor('vote', one.draft, 'Add one', one.need);
    const p2 = proposalFor('vote', two.draft, 'Add two', two.need);
    const a = decodeApproval(approve(encodeProposal(p1), ali));
    expect(checkApproval(p1, a)).toBe(true);
    expect(checkApproval(p2, { ...a, id: decodeApproval(approve(encodeProposal(p2), ali)).id })).toBe(false);
    expect(checkApproval(p1, { ...a, publicKey: omar.hex })).toBe(false);
  });

  it('describes membership changes and refuses a proposal that is out of date', () => {
    const v = vault();
    const built = buildVote(v.params, v.coins, { remove: [pkhOf(omar)] }, feeWallet(sara));
    const proposal = proposalFor('vote', built.draft, 'Remove Omar', built.need, built.requiredPkhs);
    expect(describeProposal(proposal, v.coins, names, money, 'chipnet').lines).toContain('Remove Omar.');
    // Something else spent the rules first: the proposal no longer matches the Venn.
    const moved = { ...v.coins, rules: { ...v.coins.rules, txid: 'ee'.repeat(32) } };
    expect(() => describeProposal(proposal, moved, names, money, 'chipnet')).toThrow(/out of date/);
  });

  it('a recovery request and a vote to stop it travel the same way', () => {
    const v = vault();
    const req = buildRecoveryRequest(v.params, v.coins, pkhOf(creator), newPhone.hex, false, feeWallet(sara));
    const code = encodeProposal(proposalFor('recoveryRequest', req.draft, 'New key for Creator', req.need));
    const proposal = decodeProposal(code);
    const lines = describeProposal(proposal, v.coins, names, money, 'chipnet').lines;
    expect(lines[0]).toMatch(/Give Creator’s seat a new key/);
    const approvals = [approve(code, sara), approve(code, ali)].map(decodeApproval);
    const draft = draftOf(proposal);
    const tx = finalizeRecovery(
      draft,
      approvals.map(a => ({ publicKey: a.publicKey, signature: hexToBin(a.signature) })),
      signFeeInputs(draft, sara.privateKey, sara.publicKey),
    );
    expect(vmVerify(tx, draft.sources)).toBe(true);

    const locks = [binToHex(vennLocking(v.params)), binToHex(moneyLocking(v.params))];
    const utxos = [
      ...v.utxos.filter(u => !tx.inputs.some(i => i.txid === u.txid && i.vout === u.vout)),
      ...tx.outputs.flatMap((o, i) => (locks.includes(binToHex(o.lockingBytecode)) ? [utxoFrom(tx, i, 300)] : [])),
    ];
    const after = vennCoins(v.params, utxos)!;
    const stop = buildRecoveryCancelByVote(v.params, after, pkhOf(creator), feeWallet(ali));
    const stopCode = encodeProposal(proposalFor('recoveryCancelByVote', stop.draft, 'Stop it', stop.need));
    expect(describeProposal(decodeProposal(stopCode), after, names, money, 'chipnet').lines[0]).toMatch(/Stop the recovery/);
    const stopApprovals = [approve(stopCode, sara), approve(stopCode, ali), approve(stopCode, omar)].map(decodeApproval);
    const stopDraft = draftOf(decodeProposal(stopCode));
    const stopTx = finalizeRecovery(
      stopDraft,
      stopApprovals.map(a => ({ publicKey: a.publicKey, signature: hexToBin(a.signature) })),
      signFeeInputs(stopDraft, ali.privateKey, ali.publicKey),
    );
    expect(vmVerify(stopTx, stopDraft.sources)).toBe(true);
  });

  it('key and Venn codes round-trip, and a bare public key is accepted as a key code', () => {
    expect(decodeKeyCode(encodeKeyCode(newPhone.hex, 'New phone'))).toEqual({ publicKey: newPhone.hex, name: 'New phone' });
    expect(decodeKeyCode(newPhone.hex)).toEqual({ publicKey: newPhone.hex });
    const venn = { vaultCategory: 'ab'.repeat(32), assetCategory: 'cd'.repeat(32), name: 'Home' };
    expect(decodeVennCode(encodeVennCode(venn))).toEqual(venn);
    expect(() => decodeProposal('venn:proposal:abc')).toThrow();
  });
});
