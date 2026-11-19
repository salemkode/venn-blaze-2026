import { expect, it } from 'vitest';
import { addressForLockingBytecode } from '../../src/core/cashaddr';
import { signPersonal, p2pkhForPublicKey } from '../../src/core/draft';
import { utxoFrom, vmVerify } from '../helpers';
import { people, wallet } from './fixtures';
import { VENN_FEE_ALLOCATION, VENN_TEST_USD, formatTestUsd, parseTestUsd, requireTestUsd, tokenRecipient } from '../../src/venn/asset';
import { buildBudgetSpend, buildVennFeePreparation, buildVennGenesis, finalizeSpend, signFeeInputs, signVenn } from '../../src/venn/build';
import { readMarker } from '../../src/venn/chain';
import { vennCoins } from '../../src/venn/coins';
import { accept, decodeAcceptance, fingerprint, inviteFor, membersFor, encodeAcceptance } from '../../src/venn/invite';
import { presetPlan } from '../../src/venn/presets';

it('uses exact cents for the MUSD-style test currency', () => {
  expect(parseTestUsd('20.01')).toBe(2_001n);
  expect(formatTestUsd(2_001n)).toBe('20.01');
  expect(() => parseTestUsd('20.001')).toThrow();
  expect(() => parseTestUsd('2e1')).toThrow();
});

it('requires a token-aware Chipnet destination', () => {
  const locking = p2pkhForPublicKey(people.shop.publicKey);
  expect(tokenRecipient(addressForLockingBytecode(locking, 'chipnet', true))).toEqual(locking);
  expect(() => tokenRecipient(addressForLockingBytecode(locking, 'chipnet'))).toThrow(/token-aware/);
  expect(() => tokenRecipient(addressForLockingBytecode(locking, 'mainnet', true))).toThrow(/Chipnet/);
});

it('requires the supported category and commits it to every seat acceptance', () => {
  const plan = presetPlan('shared', { name: 'Sara', publicKey: people.creator.hex }, [{ name: 'Ali', publicKey: '' }]);
  const stable = inviteFor(plan, 'chipnet', VENN_TEST_USD.category);
  const legacy = inviteFor(plan, 'chipnet');
  expect(stable.assetCategory).toBe(VENN_TEST_USD.category);
  expect(() => requireTestUsd(stable)).not.toThrow();
  expect(() => requireTestUsd(legacy)).toThrow();
  expect(() => requireTestUsd({ ...stable, network: 'mainnet' })).toThrow();
  expect(fingerprint(stable)).not.toBe(fingerprint(legacy));
  expect(() => decodeAcceptance(encodeAcceptance(accept(stable, 1, people.ali)), legacy)).toThrow(/different plan/);
});

it('funds two consecutive test-dollar payments from the initial fee allocation', () => {
  const plan = presetPlan('shared', { name: 'Sara', publicKey: people.creator.hex }, [{ name: 'Ali', publicKey: '' }], 5_000n);
  const invite = inviteFor(plan, 'chipnet', VENN_TEST_USD.category);
  const token = { ...wallet(people.creator, 10_000n, 2, 1), token: { category: VENN_TEST_USD.category, amount: 10_000n } };
  const { params, draft } = buildVennGenesis({
    utxos: [wallet(people.creator), token],
    publicKey: people.creator.publicKey,
    network: 'chipnet',
    settings: plan.settings,
    members: membersFor(invite, people.creator.hex, [accept(invite, 1, people.ali)]),
    plan: fingerprint(invite),
    asset: { category: VENN_TEST_USD.category, utxos: [token] },
    deposit: 10_000n,
    gas: VENN_FEE_ALLOCATION,
  });
  const genesis = signPersonal(draft, people.creator.privateKey, people.creator.publicKey);
  expect(vmVerify(genesis, draft.sources)).toBe(true);
  expect(readMarker(genesis)).toEqual({
    category: params.vaultCategory,
    plan: fingerprint(invite),
    assetCategory: VENN_TEST_USD.category,
  });
  const funded = genesis.outputs.map((_, i) => utxoFrom(genesis, i));
  const coins = vennCoins(params, funded)!;
  const fee = { utxos: funded, publicKey: people.ali.publicKey };
  const recipient = p2pkhForPublicKey(people.shop.publicKey);
  const spend = buildBudgetSpend(params, coins, 1, 1_800_000_000n, recipient, 2_000n, fee);
  const payment = finalizeSpend(spend, people.ali.hex, signVenn(spend, people.ali.privateKey),
    signFeeInputs(spend, people.ali.privateKey, people.ali.publicKey));
  expect(vmVerify(payment, spend.sources)).toBe(true);
  expect(payment.outputs[1].token).toEqual({ category: VENN_TEST_USD.category, amount: 2_000n });
  expect(payment.outputs[2].token).toEqual({ category: VENN_TEST_USD.category, amount: 8_000n });
  expect(() => buildBudgetSpend(params, coins, 1, 1_800_000_000n, recipient, 5_001n, fee)).toThrow(/more than/);
  const successor = [
    ...funded.filter(coin => !payment.inputs.some(input => input.txid === coin.txid && input.vout === coin.vout)),
    ...payment.outputs.map((_, index) => utxoFrom(payment, index)),
  ];
  const nextCoins = vennCoins(params, successor)!;
  const nextSeat = nextCoins.cards.findIndex(card => card.state.pkh === coins.cards[1].state.pkh);
  const nextSpend = buildBudgetSpend(params, nextCoins, nextSeat, 1_800_000_000n, recipient, 2_000n, {
    ...fee,
    utxos: successor,
  });
  const secondPayment = finalizeSpend(nextSpend, people.ali.hex, signVenn(nextSpend, people.ali.privateKey),
    signFeeInputs(nextSpend, people.ali.privateKey, people.ali.publicKey));
  expect(vmVerify(secondPayment, nextSpend.sources)).toBe(true);
  expect(secondPayment.outputs[1].token?.amount).toBe(2_000n);
  expect(secondPayment.outputs[2].token?.amount).toBe(6_000n);
  const secondCoins = vennCoins(params, [...successor.filter(coin =>
    !secondPayment.inputs.some(input => input.txid === coin.txid && input.vout === coin.vout)),
    ...secondPayment.outputs.map((_, index) => utxoFrom(secondPayment, index))])!;
  expect(secondCoins.cards.find(card => card.state.pkh === coins.cards[1].state.pkh)?.state.left).toBe(1_000n);

});

it('prepares output zero from a plain nonzero fee input and uses it for a token Venn genesis', () => {
  const fund = wallet(people.creator, 30_000n, 1, 2);
  const tokens = { ...wallet(people.creator, 1_000n, 1, 0),
    token: { category: VENN_TEST_USD.category, amount: 2_500n } };
  const draft = buildVennFeePreparation([tokens, fund], people.creator.publicKey);
  const prepared = signPersonal(draft, people.creator.privateKey, people.creator.publicKey);
  expect(prepared.inputs.map(input => input.vout)).toEqual([2]);
  expect(prepared.outputs).toEqual([{ lockingBytecode: fund.lockingBytecode, value: fund.value - draft.fee }]);
  expect(vmVerify(prepared, draft.sources)).toBe(true);
  const plan = presetPlan('personal', { name: 'Sara', publicKey: people.creator.hex }, []);
  const coin = utxoFrom(prepared, 0);
  const genesis = buildVennGenesis({
    utxos: [coin, tokens],
    publicKey: people.creator.publicKey,
    network: 'chipnet',
    settings: plan.settings,
    members: plan.members,
    asset: { category: VENN_TEST_USD.category, utxos: [tokens] },
    deposit: 1_500n,
    gas: 10_000n,
  });
  expect(genesis.params.vaultCategory).toBe(coin.txid);
  expect(vmVerify(signPersonal(genesis.draft, people.creator.privateKey, people.creator.publicKey), genesis.draft.sources)).toBe(true);
});
