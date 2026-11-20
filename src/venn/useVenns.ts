// Venns and Circles for the open wallet: the ones it has a seat in, plans it is preparing,
// group decisions it proposed, and the actions that build, sign and send their transactions
// with its Venn key. Chipnet only.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { type Bytes, binToHex, equal, hexToBin } from '../core/bytes';
import { hash160 } from '../core/crypto';
import { NeedsPreparation, p2pkhForPublicKey, signPersonal } from '../core/draft';
import { addressForLockingBytecode } from '../core/cashaddr';
import type { Transaction } from '../core/tx';
import { requireVennAsset, tokenRecipient, VENN_FEE_ALLOCATION, vennAsset } from './asset';
import { availableBudget } from './budget';
import {
  COIN_VALUE,
  type VoteChange,
  buildBudgetSpend,
  buildRecoveryCancelByKey,
  buildRecoveryCancelByVote,
  buildRecoveryComplete,
  buildRecoveryRequest,
  buildVennFeePreparation,
  buildVote,
  buildVennGenesis,
  finalizeRecovery,
  finalizeSpend,
  finalizeVote,
  signFeeInputs,
  signVenn,
} from './build';
import { chain, chainNow, findVenns, keyCoins, readCircle, readVenn } from './chain';
import { type CircleParams, type CircleState, circleMoneyAddress, payoutLocking, roundDeadline } from './circle';
import {
  type CircleCoins,
  type CircleOfficial,
  buildCircleGenesis,
  buildContribute,
  buildPayout,
  buildSweep,
  finalizeCircle,
  payoutReadyAt,
} from './circleBuild';
import { checkVennPending, readVennPending, sendVennTransaction } from './pending';
import type { VennCoins } from './coins';
import { type VennParams, vennAddress } from './contract';
import {
  type Invite,
  accept,
  decodeAcceptance,
  decodeInvite,
  encodeAcceptance,
  encodeInvite,
  fingerprint,
  membersFor,
} from './invite';
import { vennKey, vennKeyAddress, vennPublicKey } from './keys';
import {
  type Proposal,
  type ProposalKind,
  approvalFor,
  checkApproval,
  decodeApproval,
  decodeProposal,
  decodeVennCode,
  describeProposal,
  draftOf,
  encodeApproval,
  encodeKeyCode,
  encodeProposal,
  encodeVennCode,
  pkhOfKey,
  proposalFor,
  proposalId,
} from './proposal';
import type { OfficialResult } from './verify';
import { trustedNames } from './names';
import { type SavedCircle, type SavedProposal, type SavedVenn, readBook, updateBook } from './store';
import type { Network } from '../wallet/prefs';

export interface VennView {
  saved: SavedVenn;
  params: VennParams;
  address: string;
  official: OfficialResult;
  coins: VennCoins | null;
  /** Total of the Venn's money, satoshis (or token units). */
  balance: bigint;
  /** This wallet's seat, if it has one. */
  seat: number;
  available: bigint;
  /** A seat whose waiting recovery hands it to this wallet's key, if any. */
  incoming: number;
}

export interface CircleView {
  saved: SavedCircle;
  params: CircleParams;
  official: CircleOfficial;
  coins: CircleCoins | null;
  state: CircleState | null;
  /** Where contributions are paid (token-aware). */
  address: string;
  /** Money waiting for this round's payout. */
  pot: bigint;
  /** This wallet's place in the payout order, or -1. */
  seat: number;
  /** When this round may pay out: 0 now (everyone paid), a time, or null when finished. */
  readyAt: bigint | null;
}

export interface ProposalView {
  saved: SavedProposal;
  proposal: Proposal;
  need: number;
}

const moneyOf = (params: VennParams, coins: VennCoins | null) =>
  (coins?.money ?? []).reduce((sum, u) => sum + (params.assetCategory ? u.token?.amount ?? 0n : u.value), 0n);

const circleParamsOf = (c: SavedCircle, network: Network): CircleParams => ({
  network,
  circleCategory: c.category,
  assetCategory: c.assetCategory,
  contribution: BigInt(c.contribution),
  period: BigInt(c.period),
  start: BigInt(c.start),
  members: c.members,
});

export function useVenns(walletId: string | null, network: Network, enabled: boolean) {
  const [publicKey, setPublicKey] = useState('');
  const [keyAddress, setKeyAddress] = useState('');
  const [keyTokens, setKeyTokens] = useState<bigint | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [keyBalance, setKeyBalance] = useState<bigint | null>(null);
  const [venns, setVenns] = useState<VennView[]>([]);
  const [circles, setCircles] = useState<CircleView[]>([]);
  const [proposals, setProposals] = useState<ProposalView[]>([]);
  const [preparing, setPreparing] = useState<{ invite: Invite; accepted: number[] }[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const revision = useRef(0);
  const available = enabled && Boolean(walletId);
  const asset = vennAsset(network);
  /** Each network keeps its own list of Venns, Circles, plans and proposals on this device. */
  const bookId = walletId ? (network === 'mainnet' ? `${walletId}:mainnet` : walletId) : null;

  const load = useCallback(async () => {
    if (!available || !walletId) return;
    const current = ++revision.current;
    setStatus('loading');
    setError('');
    try {
      const key = hexToBin(await vennPublicKey(walletId, network));
      const pkh = binToHex(hash160(key));
      setPublicKey(binToHex(key));
      setKeyAddress(vennKeyAddress(key, network));
      const record = await readVennPending();
      if (current !== revision.current) return;
      setPending(record?.txid ?? null);
      const own = await keyCoins(key, network);
      if (current !== revision.current) return;
      setKeyTokens(own.reduce((total, u) => total + (
        u.token?.category === asset.category && !u.token.nft ? u.token.amount : 0n
      ), 0n));
      setKeyBalance(own.filter(u => !u.token).reduce((a, u) => a + u.value, 0n));
      // New seats show up as Venn and Circle creations that paid this key.
      const found = await findVenns(key, network);
      let book = await readBook(bookId!);
      const known = new Set(book.venns.map(v => v.category));
      const fresh = found.venns.filter(f => !known.has(f.params.vaultCategory));
      const knownCircles = new Set(book.circles.map(c => c.category));
      const freshCircles = found.circles.filter(f => !knownCircles.has(f.params.circleCategory));
      if (fresh.length || freshCircles.length) {
        const planOf = (b: typeof book, fp?: string) =>
          [...b.preparing.map(p => p.invite), ...b.joining.map(j => j.invite)].find(i => fingerprint(i) === fp);
        const seatOf = (b: typeof book, fp?: string) => b.joining.find(j => j.fingerprint === fp)?.seat;
        book = await updateBook(bookId!, b => ({
          ...b,
          venns: [
            ...b.venns,
            ...fresh.map(f => {
              const plan = planOf(b, f.plan);
              return {
                category: f.params.vaultCategory,
                ...(f.params.assetCategory ? { assetCategory: f.params.assetCategory } : {}),
                name: plan?.name ?? 'Venn',
                type: plan?.type ?? 'shared',
                names: plan ? trustedNames(plan, seatOf(b, f.plan), pkh) : {},
                version: 2,
                ...(f.plan ? { plan: f.plan } : {}),
              };
            }),
          ],
          circles: [
            ...b.circles,
            ...freshCircles.map(f => {
              const plan = planOf(b, f.plan);
              const names = plan ? trustedNames(plan, seatOf(b, f.plan), pkh) : {};
              return {
                category: f.params.circleCategory,
                assetCategory: f.params.assetCategory,
                contribution: f.params.contribution.toString(),
                period: f.params.period.toString(),
                start: f.params.start.toString(),
                members: f.params.members,
                name: plan?.name ?? 'Circle',
                names,
                ...(f.plan ? { plan: f.plan } : {}),
              };
            }),
          ],
          preparing: b.preparing.filter(
            p => ![...fresh, ...freshCircles].some(f => f.plan === fingerprint(p.invite)),
          ),
          joining: b.joining.filter(j => ![...fresh, ...freshCircles].some(f => f.plan === j.fingerprint)),
        }));
      }
      const now = await chainNow(network);
      const views = await Promise.all(
        book.venns.map(async (saved): Promise<VennView> => {
          const params: VennParams = {
            network,
            vaultCategory: saved.category,
            ...(saved.assetCategory ? { assetCategory: saved.assetCategory } : {}),
          };
          const address = vennAddress(params, Boolean(params.assetCategory));
          const { official, coins } = await readVenn(params);
          const seat = coins?.cards.findIndex(c => c.state.pkh === pkh) ?? -1;
          const card = seat >= 0 ? coins!.cards[seat].state : null;
          const incoming = coins?.cards.findIndex(c => c.state.recovery !== 0 && c.state.newPkh === pkh) ?? -1;
          return {
            saved,
            params,
            address,
            official,
            coins,
            balance: moneyOf(params, coins),
            seat,
            available: card && card.recovery === 0 ? availableBudget(card, now).available : 0n,
            incoming,
          };
        }),
      );
      const circleViews = await Promise.all(
        book.circles.map(async (saved): Promise<CircleView> => {
          const params = circleParamsOf(saved, network);
          const { official, coins } = await readCircle(params);
          const state = coins?.state.state ?? null;
          return {
            saved,
            params,
            official,
            coins,
            state,
            address: circleMoneyAddress(params),
            pot: (coins?.money ?? []).reduce((a, u) => a + (u.token?.amount ?? 0n), 0n),
            seat: params.members.indexOf(pkh),
            readyAt: state ? payoutReadyAt(params, state) : null,
          };
        }),
      );
      if (current !== revision.current) return;
      setVenns(views);
      setCircles(circleViews);
      setProposals(
        book.proposals.map(saved => {
          const proposal = decodeProposal(saved.code);
          return { saved, proposal, need: proposal.need };
        }),
      );
      setPreparing(book.preparing.map(p => ({ invite: p.invite, accepted: p.acceptances.map(a => a.seat) })));
      setStatus('idle');
    } catch (e) {
      if (current !== revision.current) return;
      setError((e as Error).message);
      setStatus('error');
    }
  }, [available, walletId, network, asset, bookId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the external wallet subscription before starting its async load.
    setVenns([]);
    setCircles([]);
    setProposals([]);
    setPreparing([]);
    setPublicKey('');
    setKeyAddress('');
    setKeyBalance(null);
    setKeyTokens(null);
    setPending(null);
    load();
  }, [load]);

  const myKey = async () => {
    if (!walletId) throw new Error('Open a wallet first.');
    return vennKey(walletId, network);
  };
  const feeSource = async () => {
    const key = await myKey();
    return { key, fee: { utxos: await keyCoins(key.publicKey, network), publicKey: key.publicKey } };
  };
  const usable = (view: VennView) => {
    requireVennAsset(view.params);
    if (view.official.status !== 'official' || !view.coins) throw new Error('This Venn is not official, so it cannot be used.');
    return view.coins;
  };

  /** Saves a plan being prepared and returns its invitation code. */
  const savePlan = async (invite: Invite) => {
    requireVennAsset(invite);
    await updateBook(bookId!, b => ({ ...b, preparing: [...b.preparing, { invite, acceptances: [] }] }));
    await load();
    return encodeInvite(invite);
  };

  const dropPlan = async (invite: Invite) => {
    const fp = fingerprint(invite);
    await updateBook(bookId!, b => ({ ...b, preparing: b.preparing.filter(p => fingerprint(p.invite) !== fp) }));
    await load();
  };

  /** Adds someone's acceptance to the plan it belongs to. */
  const addAcceptance = async (code: string) => {
    const book = await readBook(bookId!);
    for (const p of book.preparing) {
      try {
        const a = decodeAcceptance(code, p.invite);
        await updateBook(bookId!, b => ({
          ...b,
          preparing: b.preparing.map(q =>
            fingerprint(q.invite) === a.fingerprint
              ? { ...q, acceptances: [...q.acceptances.filter(x => x.seat !== a.seat), a] }
              : q,
          ),
        }));
        await load();
        return p.invite.seats[a.seat].name;
      } catch (e) {
        if ((e as Error).message !== 'This acceptance is for a different plan.') throw e;
      }
    }
    throw new Error('This acceptance does not belong to any plan on this wallet.');
  };

  /** Reads an invitation for this wallet. */
  const openInvite = (code: string) => {
    const invite = decodeInvite(code);
    if (invite.network !== network) throw new Error(`This invitation is for ${invite.network}.`);
    requireVennAsset(invite);
    return invite;
  };

  /** Accepts a seat and returns the code to send back to the creator. */
  const acceptInvite = async (invite: Invite, seat: number) => {
    requireVennAsset(invite);
    const code = encodeAcceptance(accept(invite, seat, await myKey()));
    await updateBook(bookId!, b => ({
      ...b,
      joining: [
        ...b.joining.filter(j => j.fingerprint !== fingerprint(invite)),
        { invite, seat, fingerprint: fingerprint(invite) },
      ],
    }));
    return code;
  };

  /** Builds the exact deposit and sponsor allocation for review after every seat accepts. */
  const prepareCreate = async (invite: Invite, deposit: bigint) => {
    requireVennAsset(invite);
    const key = await myKey();
    const book = await readBook(bookId!);
    const plan = book.preparing.find(p => fingerprint(p.invite) === fingerprint(invite));
    if (!plan) throw new Error('This plan is no longer on this wallet.');
    const members = membersFor(invite, binToHex(key.publicKey), plan.acceptances);
    const utxos = await keyCoins(key.publicKey, network);
    const names = Object.fromEntries(
      members.map((member, index) => [binToHex(hash160(hexToBin(member.publicKey))), invite.seats[index].name]),
    );
    let built: { draft: Parameters<typeof signPersonal>[0]; vault?: VennParams; circle?: CircleParams };
    try {
      if (invite.type === 'circle') {
        if (!invite.circle || !invite.turns) throw new Error('This Circle plan has no contribution or turn order.');
        const order = invite.turns.map(seat => binToHex(hash160(hexToBin(members[seat].publicKey))));
        const c = buildCircleGenesis({
          utxos,
          publicKey: key.publicKey,
          network,
          assetCategory: asset.category,
          members: order,
          contribution: BigInt(invite.circle.contribution),
          period: BigInt(invite.circle.period),
          start: await chainNow(network),
          gas: VENN_FEE_ALLOCATION,
          plan: fingerprint(invite),
        });
        built = { draft: c.draft, circle: c.params };
      } else {
        const v = buildVennGenesis({
          utxos,
          publicKey: key.publicKey,
          network,
          members,
          settings: invite.settings as never,
          asset: { category: asset.category, utxos },
          deposit,
          gas: VENN_FEE_ALLOCATION,
          plan: fingerprint(invite),
        });
        built = { draft: v.draft, vault: v.params };
      }
    } catch (e) {
      if (!(e instanceof NeedsPreparation)) throw e;
      const draft = buildVennFeePreparation(utxos, key.publicKey);
      return {
        kind: 'feePreparation' as const, walletId, invite,
        tx: signPersonal(draft, key.privateKey, key.publicKey),
        address: vennKeyAddress(key.publicKey, network),
        amountSatoshis: draft.tx.outputs[0].value,
        totalSatoshis: draft.sources[0].value,
        fee: draft.fee,
      };
    }
    const tx = signPersonal(built.draft, key.privateKey, key.publicKey);
    const own = p2pkhForPublicKey(key.publicKey);
    const spentSats = built.draft.sources.reduce((sum, source) => sum + source.value, 0n)
      - tx.outputs.reduce((sum, output) => sum + (equal(output.lockingBytecode, own) ? output.value : 0n), 0n);
    if (built.circle)
      return {
        kind: 'circle' as const, tx, circle: built.circle, walletId, invite, deposit: 0n, spentSats, fee: built.draft.fee,
        address: circleMoneyAddress(built.circle), names,
      };
    return {
      kind: 'deposit' as const, tx, params: built.vault!, walletId, invite, deposit, spentSats, fee: built.draft.fee,
      address: vennAddress(built.vault!, true), names,
    };
  };

  const send = async (prepared: { tx: Transaction; walletId: string | null; leadLock?: Bytes }) => {
    if (!available || !walletId || prepared.walletId !== walletId || AppState.currentState !== 'active')
      throw new Error('Open the same wallet and review the transaction again.');
    try {
      return await sendVennTransaction(prepared.tx, network, prepared.leadLock);
    } finally {
      const record = await readVennPending();
      setPending(record?.txid ?? null);
    }
  };

  const create = async (prepared: Awaited<ReturnType<typeof prepareCreate>>) => {
    const { invite } = prepared;
    requireVennAsset(invite);
    const book = await readBook(bookId!);
    if (!book.preparing.some(p => fingerprint(p.invite) === fingerprint(invite)))
      throw new Error('This plan is no longer on this wallet.');
    await send(prepared);
    if (prepared.kind === 'feePreparation') {
      await load();
      return;
    }
    if (prepared.kind === 'circle') {
      const { circle, names } = prepared;
      await updateBook(bookId!, b => ({
        ...b,
        circles: [
          ...b.circles.filter(c => c.category !== circle.circleCategory),
          {
            category: circle.circleCategory,
            assetCategory: circle.assetCategory,
            contribution: circle.contribution.toString(),
            period: circle.period.toString(),
            start: circle.start.toString(),
            members: circle.members,
            name: invite.name,
            names,
            plan: fingerprint(invite),
          },
        ],
        preparing: b.preparing.filter(p => fingerprint(p.invite) !== fingerprint(invite)),
      }));
      await load();
      return;
    }
    const { params, names } = prepared;
    await updateBook(bookId!, b => ({
      ...b,
      venns: [
        ...b.venns.filter(v => v.category !== params.vaultCategory),
        {
          category: params.vaultCategory,
          assetCategory: asset.category,
          name: invite.name,
          type: invite.type,
          names,
          version: 2,
          ...(invite.turns ? { turns: invite.turns } : {}),
          plan: fingerprint(invite),
        },
      ],
      preparing: b.preparing.filter(p => fingerprint(p.invite) !== fingerprint(invite)),
    }));
    await load();
  };

  /** Builds and signs a payment from this member's budget; nothing is sent yet. */
  const prepareSpend = async (view: VennView, to: string, amount: bigint) => {
    const coins = usable(view);
    if (view.seat < 0) throw new Error('You have no seat in this Venn.');
    const { key, fee } = await feeSource();
    const draft = buildBudgetSpend(view.params, coins, view.seat, await chainNow(network), tokenRecipient(to, network), amount, fee);
    const tx = finalizeSpend(
      draft,
      binToHex(key.publicKey),
      signVenn(draft, key.privateKey),
      signFeeInputs(draft, key.privateKey, key.publicKey),
    );
    return { tx, walletId, amount, address: to.trim(), fee: draft.fee, carrierSats: COIN_VALUE, leadLock: draft.sources[0].lockingBytecode };
  };

  const sendPrepared = async (prepared: { tx: Transaction; walletId: string | null; leadLock?: Bytes }) => {
    const txid = await send(prepared);
    await load();
    return txid;
  };

  const checkPending = async () => {
    await checkVennPending();
    await load();
  };

  // -------------------------------------------------------------------------------------
  // Group decisions: votes, recovery requests and votes to stop a recovery

  /** Saves a proposal this wallet made, with its own approval when it may sign. */
  const saveProposal = async (kind: ProposalKind, built: { draft: ReturnType<typeof draftOf>; need: number }, title: string, required: string[] = []) => {
    const key = await myKey();
    const proposal = proposalFor(kind, built.draft, title, built.need, required);
    const id = proposalId(proposal);
    const mine = binToHex(hash160(key.publicKey));
    const canSign = built.draft.sources.some(
      (s, i) => i > 0 && s.token?.nft?.capability === 'mutable' && s.token.nft.commitment.startsWith(mine),
    );
    const approvals = canSign
      ? [{ publicKey: binToHex(key.publicKey), signature: binToHex(signVenn(built.draft, key.privateKey)) }]
      : [];
    const code = encodeProposal(proposal);
    await updateBook(bookId!, b => ({
      ...b,
      proposals: [
        ...b.proposals.filter(p => p.id !== id),
        { id, code, category: proposal.vaultCategory, title: proposal.title, approvals },
      ],
    }));
    await load();
    return { id, code };
  };

  /** Proposes a vote: payments, members, budgets or rules. */
  const proposeVote = async (view: VennView, change: VoteChange, title: string) => {
    const coins = usable(view);
    const { fee } = await feeSource();
    const built = buildVote(view.params, coins, change, fee);
    return saveProposal('vote', built, title, built.requiredPkhs);
  };

  /** Proposes giving `target`'s seat the key in `newPublicKey`. */
  const proposeRecovery = async (view: VennView, target: string, newPublicKey: string, strong: boolean) => {
    const coins = usable(view);
    const { fee } = await feeSource();
    const built = buildRecoveryRequest(view.params, coins, target, newPublicKey, strong, fee);
    const name = view.saved.names[target] ?? 'a member';
    return saveProposal('recoveryRequest', built, `Give ${name}’s seat a new key`);
  };

  /** Proposes stopping the recovery waiting on `target`'s seat. */
  const proposeStopRecovery = async (view: VennView, target: string) => {
    const coins = usable(view);
    const { fee } = await feeSource();
    const built = buildRecoveryCancelByVote(view.params, coins, target, fee);
    const name = view.saved.names[target] ?? 'a member';
    return saveProposal('recoveryCancelByVote', built, `Stop the recovery of ${name}’s seat`);
  };

  /** Reads a proposal against the Venn's current coins, for someone deciding whether to approve. */
  const readProposal = async (code: string) => {
    const proposal = decodeProposal(code);
    const book = await readBook(bookId!);
    const saved = book.venns.find(v => v.category === proposal.vaultCategory && v.version === 2);
    if (!saved) throw new Error('This proposal is for a Venn this wallet is not in.');
    const { official, coins } = await readVenn(draftOf(proposal).venn!.params);
    if (official.status !== 'official' || !coins) throw new Error('That Venn is not official.');
    const unit = (amount: bigint) => `${amount} ${proposal.assetCategory ? `cents of ${asset.symbol}` : 'satoshis'}`;
    const described = describeProposal(proposal, coins, saved.names, unit, network);
    const key = await vennPublicKey(walletId!, network);
    const mine = pkhOfKey(key);
    return { proposal, saved, described, canSign: described.signers.includes(mine), id: proposalId(proposal) };
  };

  /** Signs a proposal and returns the approval code to send back. */
  const approveProposal = async (proposal: Proposal) => {
    const key = await myKey();
    const draft = draftOf(proposal);
    const approval = approvalFor(proposal, binToHex(key.publicKey), signVenn(draft, key.privateKey));
    const id = proposalId(proposal);
    const book = await readBook(bookId!);
    if (book.proposals.some(p => p.id === id)) {
      await updateBook(bookId!, b => ({
        ...b,
        proposals: b.proposals.map(p =>
          p.id === id
            ? { ...p, approvals: [...p.approvals.filter(a => a.publicKey !== approval.publicKey), approval] }
            : p,
        ),
      }));
      await load();
    }
    return encodeApproval(approval);
  };

  /** Adds an approval code to the proposal it belongs to; returns the approver's name. */
  const addApproval = async (code: string) => {
    const approval = decodeApproval(code);
    const book = await readBook(bookId!);
    const saved = book.proposals.find(p => p.id === approval.id);
    if (!saved) throw new Error('This approval is for a proposal this wallet did not make.');
    const proposal = decodeProposal(saved.code);
    if (!checkApproval(proposal, approval)) throw new Error('This approval is not signed correctly for this proposal.');
    await updateBook(bookId!, b => ({
      ...b,
      proposals: b.proposals.map(p =>
        p.id === approval.id
          ? { ...p, approvals: [...p.approvals.filter(a => a.publicKey !== approval.publicKey), approval] }
          : p,
      ),
    }));
    await load();
    const venn = book.venns.find(v => v.category === saved.category);
    return venn?.names[pkhOfKey(approval.publicKey)] ?? 'A member';
  };

  /** With enough approvals, signs the fee and builds the final transaction for review. */
  const prepareProposal = async (id: string) => {
    const book = await readBook(bookId!);
    const saved = book.proposals.find(p => p.id === id);
    if (!saved) throw new Error('This proposal is no longer on this wallet.');
    const proposal = decodeProposal(saved.code);
    const draft = draftOf(proposal);
    const key = await myKey();
    const approvals = saved.approvals.map(a => ({ publicKey: a.publicKey, signature: hexToBin(a.signature) }));
    if (approvals.length < proposal.need)
      throw new Error(`${proposal.need} approvals are needed; ${approvals.length} collected.`);
    const base = signFeeInputs(draft, key.privateKey, key.publicKey);
    const tx =
      proposal.kind === 'vote'
        ? finalizeVote(draft, approvals, base)
        : finalizeRecovery(draft, approvals, base);
    return { tx, walletId, id, title: proposal.title, fee: draft.fee, leadLock: draft.sources[0].lockingBytecode };
  };

  const sendProposal = async (prepared: Awaited<ReturnType<typeof prepareProposal>>) => {
    const txid = await send(prepared);
    await updateBook(bookId!, b => ({ ...b, proposals: b.proposals.filter(p => p.id !== prepared.id) }));
    await load();
    return txid;
  };

  const dropProposal = async (id: string) => {
    await updateBook(bookId!, b => ({ ...b, proposals: b.proposals.filter(p => p.id !== id) }));
    await load();
  };

  // -------------------------------------------------------------------------------------
  // Recovery by one key: stopping a request on your own seat, and completing on a new phone

  /** The seat's current key stops a request it may stop. */
  const prepareStopByKey = async (view: VennView) => {
    const coins = usable(view);
    if (view.seat < 0) throw new Error('You have no seat in this Venn.');
    const { key, fee } = await feeSource();
    const target = coins.cards[view.seat].state.pkh;
    const draft = buildRecoveryCancelByKey(view.params, coins, target, fee);
    const tx = finalizeRecovery(
      draft,
      { publicKey: binToHex(key.publicKey), signature: signVenn(draft, key.privateKey) },
      signFeeInputs(draft, key.privateKey, key.publicKey),
    );
    return { tx, walletId, fee: draft.fee, leadLock: draft.sources[0].lockingBytecode };
  };

  /** The new key takes over its seat once the wait has passed. */
  const prepareCompleteRecovery = async (view: VennView) => {
    const coins = usable(view);
    if (view.incoming < 0) throw new Error('No recovery is waiting for this wallet’s key.');
    const card = coins.cards[view.incoming];
    const client = chain(network);
    const elapsed = await client.lockElapsed(card.height, await client.tipHeight());
    const { key, fee } = await feeSource();
    const draft = buildRecoveryComplete(view.params, coins, card.state.pkh, elapsed, fee);
    const tx = finalizeRecovery(
      draft,
      { publicKey: binToHex(key.publicKey), signature: signVenn(draft, key.privateKey) },
      signFeeInputs(draft, key.privateKey, key.publicKey),
    );
    return { tx, walletId, fee: draft.fee, leadLock: draft.sources[0].lockingBytecode };
  };

  /** A Venn's code, for a member's new phone to follow while its recovery completes. */
  const vennCode = (view: VennView) =>
    encodeVennCode({
      network,
      vaultCategory: view.params.vaultCategory,
      ...(view.params.assetCategory ? { assetCategory: view.params.assetCategory } : {}),
      name: view.saved.name,
    });

  /** Follows a Venn from its code (a new phone waiting to take over its seat). */
  const followVenn = async (code: string) => {
    const v = decodeVennCode(code);
    if (v.network !== network) throw new Error(`This Venn is on ${v.network}, and this wallet is on ${network}.`);
    requireVennAsset({ network, assetCategory: v.assetCategory });
    const params: VennParams = { network, vaultCategory: v.vaultCategory, ...(v.assetCategory ? { assetCategory: v.assetCategory } : {}) };
    const { official } = await readVenn(params);
    if (official.status !== 'official') throw new Error(`That Venn is not official: ${official.reason}.`);
    await updateBook(bookId!, b => ({
      ...b,
      venns: b.venns.some(x => x.category === v.vaultCategory)
        ? b.venns
        : [...b.venns, { category: v.vaultCategory, ...(v.assetCategory ? { assetCategory: v.assetCategory } : {}), name: v.name, type: 'shared', names: {}, version: 2, following: true }],
    }));
    await load();
    return v.name;
  };

  // -------------------------------------------------------------------------------------
  // Circles

  const usableCircle = (view: CircleView) => {
    if (view.official.status !== 'official' || !view.coins) throw new Error('This Circle is not official, so it cannot be used.');
    return view.coins;
  };

  /** Pays a seat's contribution for this round (your own seat by default). */
  const prepareContribute = async (view: CircleView, seat = view.seat) => {
    const coins = usableCircle(view);
    const { key, fee } = await feeSource();
    const draft = buildContribute(view.params, coins, seat, fee);
    const tx = finalizeCircle(draft, signFeeInputs(draft, key.privateKey, key.publicKey));
    return { tx, walletId, fee: draft.fee, amount: view.params.contribution, leadLock: draft.sources[0].lockingBytecode };
  };

  /** Pays this round's pot to the member whose turn it is. */
  const preparePayout = async (view: CircleView) => {
    const coins = usableCircle(view);
    const { key, fee } = await feeSource();
    const draft = buildPayout(view.params, coins, await chainNow(network), fee);
    const tx = finalizeCircle(draft, signFeeInputs(draft, key.privateKey, key.publicKey));
    const to = view.params.members[coins.state.state.round];
    return {
      tx, walletId, fee: draft.fee, amount: view.pot, recipient: to,
      address: addressForLockingBytecode(payoutLocking(to), network, true),
      leadLock: draft.sources[0].lockingBytecode,
    };
  };

  /** Sends money left at a finished Circle to its last member. */
  const prepareSweep = async (view: CircleView) => {
    const coins = usableCircle(view);
    const { key, fee } = await feeSource();
    const draft = buildSweep(view.params, coins, fee);
    const tx = finalizeCircle(draft, signFeeInputs(draft, key.privateKey, key.publicKey));
    const to = view.params.members[view.params.members.length - 1];
    return {
      tx, walletId, fee: draft.fee, amount: view.pot, recipient: to,
      address: addressForLockingBytecode(payoutLocking(to), network, true),
      leadLock: draft.sources[0].lockingBytecode,
    };
  };

  return {
    available,
    publicKey,
    keyAddress,
    keyBalance,
    keyTokens,
    keyTokenAddress: publicKey ? addressForLockingBytecode(p2pkhForPublicKey(hexToBin(publicKey)), network, true) : '',
    network,
    asset,
    keyCode: publicKey ? encodeKeyCode(publicKey) : '',
    pending,
    checkPending,
    venns,
    circles,
    proposals,
    preparing,
    status,
    error,
    reload: load,
    savePlan,
    dropPlan,
    addAcceptance,
    openInvite,
    acceptInvite,
    prepareCreate,
    create,
    prepareSpend,
    sendPrepared,
    proposeVote,
    proposeRecovery,
    proposeStopRecovery,
    readProposal,
    approveProposal,
    addApproval,
    prepareProposal,
    sendProposal,
    dropProposal,
    prepareStopByKey,
    prepareCompleteRecovery,
    vennCode,
    followVenn,
    prepareContribute,
    preparePayout,
    prepareSweep,
    deadlineOf: (view: CircleView) => (view.state ? roundDeadline(view.params, view.state.round) : null),
  };
}

export type VennsState = ReturnType<typeof useVenns>;
