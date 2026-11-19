import { signPersonal, p2pkhForPublicKey } from '../../src/core/draft';
import { binToHex, concat, equal } from '../../src/core/bytes';
import { hash160 } from '../../src/core/crypto';
import { buildVennGenesis, finalizeVenn, signVenn } from '../../src/venn/build';
import { vennCoins } from '../../src/venn/coins';
import { moneyLocking, vennLocking } from '../../src/venn/contract';
import { BUDGET, type CardState, ROLE, type RulesState } from '../../src/venn/layout';
import type { Draft, Utxo } from '../../src/core/draft';
import type { Transaction } from '../../src/core/tx';
import type { MemberSpec, RulesSettings } from '../../src/venn/build';
import { fakeTxid, key, utxoFrom } from '../helpers';
export const sampleCard = (over: Partial<CardState> = {}): CardState => ({
  pkh: '11'.repeat(20),
  roles: ROLE.SPEND | ROLE.VOTE,
  budgetMode: BUDGET.REFILL,
  budget: 50n,
  period: 86_400n,
  cap: 0n,
  left: 0n,
  last: 1_700_000_000n,
  recovery: 0,
  newPkh: '00'.repeat(20),
  waitUnits: 0,
  ...over,
});

export const sampleRules = (over: Partial<RulesState> = {}): RulesState => ({
  version: 1,
  voters: 3,
  required: 1,
  membership: 1,
  spending: 1,
  recoveryRule: 1,
  governance: 2,
  payments: 1,
  recoveryOn: true,
  helpersNeeded: 2,
  waitUnits: 1181,
  stopRule: 3,
  strongNeeded: 2,
  strongWaitUnits: 2362,
  helpers: 2,
  ...over,
});

export const people = {
  creator: key(21),
  sara: key(22),
  ali: key(23),
  omar: key(24),
  lina: key(25),
  newPhone: key(26),
  shop: key(29),
};

export const wallet = (who = people.creator, value = 2_000_000n, n = 1, vout = 0): Utxo => ({
  txid: fakeTxid(n),
  vout,
  value,
  height: 50,
  lockingBytecode: p2pkhForPublicKey(who.publicKey),
});

export const member = (who: { hex: string }, roles: number, over: Partial<MemberSpec> = {}): MemberSpec => ({
  publicKey: who.hex,
  roles,
  budgetMode: 0,
  budget: 0n,
  period: 0n,
  cap: 0n,
  ...over,
});

export const settings = (over: Partial<RulesSettings> = {}): RulesSettings => ({
  membership: 1,
  spending: 1,
  recoveryRule: 1,
  governance: 2,
  payments: 1,
  recoveryOn: true,
  helpersNeeded: 2,
  waitUnits: 1,
  stopRule: 3,
  strongNeeded: 2,
  strongWaitUnits: 2,
  ...over,
});

/** A created vault, its coins as UTXOs, and a fee wallet for each person. */
export const makeVault = (o: {
  members: MemberSpec[];
  settings?: Partial<RulesSettings>;
  deposit?: bigint;
  asset?: string;
  extraMoney?: bigint[];
}) => {
  const asset = o.asset;
  const tokenCoin: Utxo | undefined = asset
    ? { ...wallet(people.creator, 1_000n, 7, 1), token: { category: asset, amount: 1_000_000n } }
    : undefined;
  const { params, draft } = buildVennGenesis({
    utxos: [wallet()],
    publicKey: people.creator.publicKey,
    network: 'chipnet',
    members: o.members,
    settings: settings(o.settings),
    asset: asset ? { category: asset, utxos: [tokenCoin!] } : undefined,
    deposit: o.deposit ?? (asset ? 500_000n : 300_000n),
    gas: 3_000n,
  });
  const tx = signPersonal(draft, people.creator.privateKey, people.creator.publicKey);
  const vaultOutputs = tx.outputs
    .map((_, i) => i)
    .filter(
      i =>
        equal(tx.outputs[i].lockingBytecode, vennLocking(params)) ||
        equal(tx.outputs[i].lockingBytecode, moneyLocking(params)),
    );
  const utxos = vaultOutputs.map(i => utxoFrom(tx, i, 100));
  (o.extraMoney ?? []).forEach((value, n) =>
    utxos.push({ txid: fakeTxid(500 + n), vout: 0, value, height: 100, lockingBytecode: moneyLocking(params) }),
  );
  const coins = vennCoins(params, utxos)!;
  return { params, coins, utxos, genesis: tx };
};

export const feeWallet = (who: ReturnType<typeof key>, n = 900) => ({
  utxos: [wallet(who, 200_000n, n, 0)],
  publicKey: who.publicKey,
});

/** Encodes the supplied witness, including cases the wallet refuses to sign off on. */
export function withRawApprovals(draft: Draft, signers: ReturnType<typeof key>[], base: Transaction) {
  const entries = signers.map(signer => {
    const pkh = binToHex(hash160(signer.publicKey));
    const index = draft.sources.findIndex(source => source.token?.nft?.commitment.startsWith(pkh));
    if (index < 1) throw new Error('Fixture signer has no card input');
    const signature = signVenn(draft, signer.privateKey);
    return {
      index,
      bytes: concat(Uint8Array.of(index), signer.publicKey, Uint8Array.of(signature.length), signature),
    };
  });
  entries.sort((a, b) => a.index - b.index);
  const witness = concat(...entries.map(entry => entry.bytes));
  return finalizeVenn(draft, [witness, ...draft.venn!.lead.slice(1)], base);
}
