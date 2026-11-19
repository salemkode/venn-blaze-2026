// Circle (jam'eya) contract: every transaction is judged by the real BCH 2026 VM.
import { describe, expect, it } from 'vitest';
import { binToHex, equal } from '../../src/core/bytes';
import { hash160 } from '../../src/core/crypto';
import { type Draft, type Utxo, p2pkhForPublicKey, signPersonal } from '../../src/core/draft';
import type { Output, Transaction } from '../../src/core/tx';
import { signFeeInputs } from '../../src/venn/build';
import {
  type CircleParams,
  circleLocking,
  circleMoneyLocking,
  decodeCircleState,
  encodeCircleState,
  readCircleGenesis,
  roundDeadline,
  verifyCircleGenesis,
} from '../../src/venn/circle';
import {
  type CircleCoins,
  buildCircleGenesis,
  buildContribute,
  buildPayout,
  buildSweep,
  circleCoins,
  circleOfficial,
  finalizeCircle,
} from '../../src/venn/circleBuild';
import { fakeTxid, key, utxoFrom, vmVerify } from '../helpers';
import { people, wallet } from './fixtures';

const { creator, sara, ali, omar, shop } = people;
const four = [creator, sara, ali, omar];
type Key = ReturnType<typeof key>;
const ASSET = 'ab'.repeat(32);
const C = 25_000n;
const DAY = 86_400n;
const START = 1_800_000_000n;
const pkhOf = (k: Key) => binToHex(hash160(k.publicKey));
const consensus = (tx: Transaction, sources: Output[]) => vmVerify(tx, sources, false);

/** A person's wallet: BCH for fees plus Test USD tokens. */
const purse = (who: Key, n: number): { utxos: Utxo[]; publicKey: Uint8Array } => ({
  publicKey: who.publicKey,
  utxos: [
    wallet(who, 200_000n, n, 0),
    { ...wallet(who, 1_000n, n, 1), token: { category: ASSET, amount: 1_000_000n } },
  ],
});

const create = () => {
  const { params, draft } = buildCircleGenesis({
    utxos: [wallet()],
    publicKey: creator.publicKey,
    network: 'chipnet',
    assetCategory: ASSET,
    members: four.map(pkhOf),
    contribution: C,
    period: 30n * DAY,
    start: START,
    gas: 3_000n,
    plan: 'cd'.repeat(32),
  });
  const genesis = signPersonal(draft, creator.privateKey, creator.publicKey);
  expect(vmVerify(genesis, draft.sources)).toBe(true);
  const utxos = [utxoFrom(genesis, 0, 100)];
  return { params, genesis, utxos, coins: circleCoins(params, utxos)! };
};
type Circle = ReturnType<typeof create>;

const after = (c: Circle, tx: Transaction): Circle => {
  const locks = [binToHex(circleLocking(c.params)), binToHex(circleMoneyLocking(c.params))];
  const kept = c.utxos.filter(u => !tx.inputs.some(i => i.txid === u.txid && i.vout === u.vout));
  const fresh = tx.outputs.flatMap((o, i) => (locks.includes(binToHex(o.lockingBytecode)) ? [utxoFrom(tx, i, 200)] : []));
  const utxos = [...kept, ...fresh];
  return { ...c, utxos, coins: circleCoins(c.params, utxos)! };
};

const finish = (draft: Draft, who: Key, tweak?: (t: Transaction, s: Output[]) => void) => {
  tweak?.(draft.tx, draft.sources);
  return finalizeCircle(draft, signFeeInputs(draft, who.privateKey, who.publicKey));
};

const contribute = (c: Circle, seat: number, who: Key, n: number, tweak?: (t: Transaction, s: Output[]) => void) => {
  const draft = buildContribute(c.params, c.coins, seat, purse(who, n));
  return { draft, tx: finish(draft, who, tweak) };
};

const payout = (c: Circle, now: bigint, who: Key, n: number, tweak?: (t: Transaction, s: Output[]) => void) => {
  const draft = buildPayout(c.params, c.coins, now, purse(who, n));
  return { draft, tx: finish(draft, who, tweak) };
};

/** Everyone in `seats` pays this round, each from their own purse. */
const payAll = (c: Circle, seats: number[], base: number): Circle => {
  let next = c;
  for (const seat of seats) {
    const r = contribute(next, seat, four[seat], base + seat);
    expect(vmVerify(r.tx, r.draft.sources)).toBe(true);
    next = after(next, r.tx);
  }
  return next;
};

const stateOf = (c: Circle) => c.coins.state.state;

describe('circle creation', () => {
  it('creates one fresh state token and records its settings for every member', () => {
    const c = create();
    expect(stateOf(c)).toEqual({ round: 0, paid: 0, missed: 0 });
    const read = readCircleGenesis(c.genesis, 'chipnet');
    expect(read?.params).toEqual(c.params);
    expect(read?.plan).toBe('cd'.repeat(32));
    expect(() => verifyCircleGenesis(c.params, c.genesis)).not.toThrow();
    expect(circleOfficial(c.params, c.genesis, c.coins)).toMatchObject({ status: 'official' });
    for (const k of four)
      expect(c.genesis.outputs.some(o => equal(o.lockingBytecode, p2pkhForPublicKey(k.publicKey)))).toBe(true);
  });

  it('a creation that kept a second Circle token, or sent it elsewhere, is not official', () => {
    const c = create();
    const moved: Transaction = {
      ...c.genesis,
      outputs: c.genesis.outputs.map((o, i) => (i === 0 ? { ...o, lockingBytecode: p2pkhForPublicKey(creator.publicKey) } : o)),
    };
    expect(circleOfficial(c.params, moved, c.coins).status).toBe('not-official');
    const two: Transaction = { ...c.genesis, outputs: [...c.genesis.outputs, c.genesis.outputs[0]] };
    expect(circleOfficial(c.params, two, c.coins).status).toBe('not-official');
    const other: CircleParams = { ...c.params, contribution: C + 1n };
    expect(circleOfficial(other, c.genesis, c.coins).status).toBe('not-official');
  });

  it('refuses invalid circles', () => {
    const base = {
      utxos: [wallet()], publicKey: creator.publicKey, network: 'chipnet' as const, assetCategory: ASSET,
      contribution: C, period: 30n * DAY, start: START, gas: 3_000n,
    };
    expect(() => buildCircleGenesis({ ...base, members: [pkhOf(creator)] })).toThrow(/2 to 16/);
    expect(() => buildCircleGenesis({ ...base, members: [pkhOf(creator), pkhOf(creator)] })).toThrow(/one turn/);
    expect(() => buildCircleGenesis({ ...base, members: [pkhOf(sara), pkhOf(ali)] })).toThrow(/member of a Circle/);
    expect(() => buildCircleGenesis({ ...base, members: four.map(pkhOf), period: 60n })).toThrow(/hour/);
  });
});

describe('circle contributions', () => {
  it('each seat pays exactly the contribution, once per round', () => {
    let c = create();
    const r = contribute(c, 1, sara, 10);
    expect(vmVerify(r.tx, r.draft.sources)).toBe(true);
    expect(r.tx.outputs[1]).toMatchObject({ token: { category: ASSET, amount: C } });
    c = after(c, r.tx);
    expect(stateOf(c).paid).toBe(0b0010);
    expect(() => buildContribute(c.params, c.coins, 1, purse(sara, 11))).toThrow(/already paid/);
  });

  it('anyone may pay a seat’s contribution for them', () => {
    const c = create();
    const r = contribute(c, 3, shop, 12);
    expect(vmVerify(r.tx, r.draft.sources)).toBe(true);
  });

  it('a contribution that is short, marks two seats, or goes elsewhere is refused', () => {
    const c = create();
    const short = contribute(c, 1, sara, 10, t => {
      t.outputs[1] = { ...t.outputs[1], token: { category: ASSET, amount: C - 1n } };
      t.outputs[2] = { ...t.outputs[2], token: { category: ASSET, amount: t.outputs[2].token!.amount + 1n } };
    });
    expect(consensus(short.tx, short.draft.sources)).not.toBe(true);
    const twoSeats = contribute(c, 1, sara, 10, t => {
      t.outputs[0] = {
        ...t.outputs[0],
        token: { ...t.outputs[0].token!, nft: { capability: 'mutable', commitment: encodeCircleState({ round: 0, paid: 0b0110, missed: 0 }) } },
      };
    });
    expect(consensus(twoSeats.tx, twoSeats.draft.sources)).not.toBe(true);
    const elsewhere = contribute(c, 1, sara, 10, t => {
      t.outputs[1] = { ...t.outputs[1], lockingBytecode: p2pkhForPublicKey(sara.publicKey) };
    });
    expect(consensus(elsewhere.tx, elsewhere.draft.sources)).not.toBe(true);
  });

  it('the state token cannot leave the Circle or be duplicated', () => {
    const c = create();
    const stolen = contribute(c, 1, sara, 10, t => {
      t.outputs[0] = { ...t.outputs[0], lockingBytecode: p2pkhForPublicKey(sara.publicKey) };
    });
    expect(consensus(stolen.tx, stolen.draft.sources)).not.toBe(true);
  });
});

describe('circle payouts', () => {
  it('pays the whole pot to round 0’s member as soon as everyone has paid', () => {
    let c = payAll(create(), [0, 1, 2, 3], 20);
    const r = payout(c, 0n, shop, 30);
    expect(vmVerify(r.tx, r.draft.sources)).toBe(true);
    expect(r.tx.locktime).toBe(0);
    expect(r.tx.outputs[1].lockingBytecode).toEqual(p2pkhForPublicKey(creator.publicKey));
    expect(r.tx.outputs[1].token).toEqual({ category: ASSET, amount: 4n * C });
    c = after(c, r.tx);
    expect(stateOf(c)).toEqual({ round: 1, paid: 0, missed: 0 });
    expect(c.coins.money).toHaveLength(0);
  });

  it('waits for the deadline when someone has not paid, then records who missed', () => {
    let c = payAll(create(), [0, 2], 20);
    const deadline = roundDeadline(c.params, 0);
    expect(() => buildPayout(c.params, c.coins, deadline - 1n, purse(shop, 30))).toThrow(/deadline/);
    const early = payout(c, deadline, shop, 30, t => {
      t.locktime = Number(deadline - 1n);
    });
    expect(consensus(early.tx, early.draft.sources)).not.toBe(true);
    const r = payout(c, deadline, shop, 30);
    expect(vmVerify(r.tx, r.draft.sources)).toBe(true);
    expect(r.tx.outputs[1].token).toEqual({ category: ASSET, amount: 2n * C });
    c = after(c, r.tx);
    expect(stateOf(c)).toEqual({ round: 1, paid: 0, missed: 0b1010 });
  });

  it('the pot cannot go to anyone but the round’s member', () => {
    const c = payAll(create(), [0, 1, 2, 3], 20);
    const wrong = payout(c, 0n, sara, 30, t => {
      t.outputs[1] = { ...t.outputs[1], lockingBytecode: p2pkhForPublicKey(sara.publicKey) };
    });
    expect(consensus(wrong.tx, wrong.draft.sources)).not.toBe(true);
    const skim = payout(c, 0n, sara, 30, t => {
      t.outputs[1] = { ...t.outputs[1], token: { category: ASSET, amount: 4n * C - 1n } };
      t.outputs.splice(2, 0, { value: 1_000n, lockingBytecode: p2pkhForPublicKey(sara.publicKey), token: { category: ASSET, amount: 1n } });
    });
    expect(consensus(skim.tx, skim.draft.sources)).not.toBe(true);
  });

  it('a payout cannot leave a paid contribution behind for a later round', () => {
    const c = payAll(create(), [0, 1, 2, 3], 20);
    const lighter: CircleCoins = { ...c.coins, money: c.coins.money.slice(1) };
    const draft = buildPayout(c.params, lighter, 0n, purse(shop, 30));
    const tx = finalizeCircle(draft, signFeeInputs(draft, shop.privateKey, shop.publicKey));
    expect(consensus(tx, draft.sources)).not.toBe(true);
  });

  it('a payout cannot skip a round or reset who missed', () => {
    const c = payAll(create(), [0, 1, 2, 3], 20);
    const skip = payout(c, 0n, shop, 30, t => {
      t.outputs[0] = {
        ...t.outputs[0],
        token: { ...t.outputs[0].token!, nft: { capability: 'mutable', commitment: encodeCircleState({ round: 2, paid: 0, missed: 0 }) } },
      };
    });
    expect(consensus(skip.tx, skip.draft.sources)).not.toBe(true);
  });

  it('runs every round in turn order and then stops', () => {
    let c = create();
    for (let round = 0; round < 4; round++) {
      c = payAll(c, [0, 1, 2, 3], 100 + round * 10);
      const r = payout(c, 0n, shop, 200 + round);
      expect(vmVerify(r.tx, r.draft.sources)).toBe(true);
      expect(r.tx.outputs[1].lockingBytecode).toEqual(p2pkhForPublicKey(four[round].publicKey));
      c = after(c, r.tx);
    }
    expect(stateOf(c).round).toBe(4);
    expect(() => buildContribute(c.params, c.coins, 0, purse(creator, 300))).toThrow(/finished/);
    expect(() => buildPayout(c.params, c.coins, START * 2n, purse(creator, 300))).toThrow(/finished/);
  });
});

describe('circle money', () => {
  it('a contribution coin cannot be spent unless the Circle leads', () => {
    const c = payAll(create(), [1], 20);
    const coin = c.coins.money[0];
    const fee = wallet(sara, 50_000n, 77, 0);
    const draft: Draft = {
      tx: {
        version: 2,
        locktime: 0,
        inputs: [fee, coin].map(u => ({ txid: u.txid, vout: u.vout, sequence: 0xffffffff, unlockingBytecode: new Uint8Array() })),
        outputs: [{ value: 40_000n, lockingBytecode: p2pkhForPublicKey(sara.publicKey), token: { category: ASSET, amount: C } }],
      },
      sources: [fee, coin].map(u => ({ value: u.value, lockingBytecode: u.lockingBytecode, ...(u.token ? { token: u.token } : {}) })),
      fee: 0n,
      circle: { params: c.params, fn: 'payout', args: [] },
    };
    const tx = finalizeCircle(draft, signFeeInputs(draft, sara.privateKey, sara.publicKey));
    expect(consensus(tx, draft.sources)).not.toBe(true);
  });

  it('state is read only from the Circle address', () => {
    const c = create();
    const fake = { ...c.utxos[0], txid: fakeTxid(99), lockingBytecode: p2pkhForPublicKey(sara.publicKey) };
    expect(circleCoins(c.params, [fake])).toBe(null);
    expect(() => decodeCircleState('01' + '05' + '000000' + '000000', 4)).toThrow();
  });
});

describe('circle leftovers and schedules', () => {
  const finished = () => {
    let c = create();
    for (let round = 0; round < 4; round++) {
      c = payAll(c, [0, 1, 2, 3], 400 + round * 10);
      const r = payout(c, 0n, shop, 500 + round);
      expect(vmVerify(r.tx, r.draft.sources)).toBe(true);
      c = after(c, r.tx);
    }
    return c;
  };
  const stray = (c: Circle, n: number, amount: bigint, value = 15_000n): Circle => {
    const coin = { txid: fakeTxid(n), vout: 0, value, height: 300, lockingBytecode: circleMoneyLocking(c.params), token: { category: ASSET, amount } };
    const utxos = [...c.utxos, coin];
    return { ...c, utxos, coins: circleCoins(c.params, utxos)! };
  };

  it('money left behind by the last payout, or sent later, goes to the last member', () => {
    const c = stray(finished(), 801, 999n);
    const draft = buildSweep(c.params, c.coins, purse(shop, 600));
    const tx = finish(draft, shop);
    expect(vmVerify(tx, draft.sources)).toBe(true);
    expect(tx.outputs[1].lockingBytecode).toEqual(p2pkhForPublicKey(omar.publicKey));
    expect(tx.outputs[1].token).toEqual({ category: ASSET, amount: 999n });
    expect(decodeCircleState(tx.outputs[0].token!.nft!.commitment, 4).round).toBe(4);
  });

  it('a sweep cannot go elsewhere, keep part of it, or run before the Circle ends', () => {
    const c = stray(finished(), 802, 999n);
    const draft = buildSweep(c.params, c.coins, purse(shop, 601));
    const elsewhere = finish(draft, shop, t => {
      t.outputs[1] = { ...t.outputs[1], lockingBytecode: p2pkhForPublicKey(shop.publicKey) };
    });
    expect(consensus(elsewhere, draft.sources)).not.toBe(true);
    const draft2 = buildSweep(c.params, c.coins, purse(shop, 602));
    const partial = finish(draft2, shop, t => {
      t.outputs[1] = { ...t.outputs[1], token: { category: ASSET, amount: 998n } };
    });
    expect(consensus(partial, draft2.sources)).not.toBe(true);

    const early = stray(payAll(create(), [0, 1, 2, 3], 20), 803, 5n);
    expect(() => buildSweep(early.params, early.coins, purse(shop, 603))).toThrow(/rounds left/);
    const forced = buildSweep(early.params, { ...early.coins, state: { ...early.coins.state, state: { ...early.coins.state.state, round: 4 } } }, purse(shop, 604));
    expect(consensus(finish(forced, shop), forced.sources)).not.toBe(true);
  });

  it('a Circle whose deadlines do not fit a locktime is refused, and never accepts money', () => {
    const c = create();
    expect(() => verifyCircleGenesis({ ...c.params, period: 2n ** 39n }, c.genesis)).toThrow();
    const base = {
      utxos: [wallet()], publicKey: creator.publicKey, network: 'chipnet' as const, assetCategory: ASSET,
      contribution: C, start: START, gas: 3_000n, members: four.map(pkhOf),
    };
    expect(() => buildCircleGenesis({ ...base, period: 2n ** 39n })).toThrow(/2106/);
    // Built directly, past the app's checks: the contract itself refuses a contribution.
    const params: CircleParams = { ...c.params, period: 2n ** 30n };
    const lock = circleLocking(params);
    const state = { ...c.utxos[0], lockingBytecode: lock };
    const coins = circleCoins(params, [state])!;
    const draft = buildContribute(params, coins, 1, purse(sara, 700));
    expect(consensus(finish(draft, sara), draft.sources)).not.toBe(true);
  });
});
