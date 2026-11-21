// Moving the fee balance off a Venn key: every plain BCH coin goes to one address, token coins
// (MUSD, seat cards) stay, and the transaction is valid in the BCH VM.
import { expect, it } from 'vitest';
import { signPersonal, p2pkhForPublicKey } from '../../src/core/draft';
import { vmVerify } from '../helpers';
import { people, wallet } from './fixtures';
import { MUSD } from '../../src/venn/asset';
import { buildVennKeySweep } from '../../src/venn/build';

const to = p2pkhForPublicKey(people.sara.publicKey);

it('moves every plain BCH coin and leaves token coins on the key', () => {
  const a = wallet(people.creator, 300_000n, 1, 0);
  const b = wallet(people.creator, 50_000n, 2, 1);
  const tokens = { ...wallet(people.creator, 1_000n, 3, 0), token: { category: MUSD.category, amount: 10n } };
  const draft = buildVennKeySweep([tokens, a, b], people.creator.publicKey, to);
  const tx = signPersonal(draft, people.creator.privateKey, people.creator.publicKey);
  expect(tx.inputs).toHaveLength(2);
  expect(draft.sources.every(source => !source.token)).toBe(true);
  expect(tx.outputs).toEqual([{ lockingBytecode: to, value: 350_000n - draft.fee }]);
  expect(draft.fee).toBeGreaterThan(0n);
  expect(vmVerify(tx, draft.sources)).toBe(true);
});

it('refuses when the key has no plain BCH, or too little to pay the fee', () => {
  const tokens = { ...wallet(people.creator, 1_000n, 3, 0), token: { category: MUSD.category, amount: 10n } };
  expect(() => buildVennKeySweep([tokens], people.creator.publicKey, to)).toThrow('no BCH');
  expect(() => buildVennKeySweep([wallet(people.creator, 600n, 1, 0)], people.creator.publicKey, to)).toThrow('Too little');
});
