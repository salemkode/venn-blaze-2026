// Group decisions without a server. A member builds the transaction (a vote, a recovery
// request or a vote to stop one) and shares it as a proposal code. Every approver reads what
// the transaction itself does, checked against the Venn's current coins, and signs it with
// their Venn key; the approval goes back as a code. With enough approvals the proposer sends it.
import { base64ToBin, binToBase64, binToUtf8, utf8ToBin } from '@bitauth/libauth';
import { z } from 'zod';
import { binToHex, concat, equal, hexToBin } from '../core/bytes';
import { hash160, sha256 } from '../core/crypto';
import type { Draft, Utxo } from '../core/draft';
import { decodeOutputs, decodeTransaction, encodeOutput, encodeTransaction, type Output } from '../core/tx';
import { type Network, addressForLockingBytecode } from '../core/cashaddr';
import { checkVennSignature } from './build';
import { freezeWarning, whoCanStop } from './recoveryGuard';
import type { VennCoins } from './coins';
import { type VennFunction, type VennParams, moneyLocking, vennLocking } from './contract';
import {
  type CardState,
  ROLE,
  STOP,
  type RulesState,
  decodeCardState,
  decodeRulesState,
} from './layout';

const PROPOSAL = 'venn:proposal:';
const APPROVAL = 'venn:approval:';
const KEY = 'venn:key:';
const VENN = 'venn:venn:';

export type ProposalKind = 'vote' | 'recoveryRequest' | 'recoveryCancelByVote';

const hex = z.string().regex(/^([0-9a-f]{2})*$/);
const proposalSchema = z.object({
  v: z.literal(1),
  network: z.enum(['chipnet', 'mainnet']),
  kind: z.enum(['vote', 'recoveryRequest', 'recoveryCancelByVote']),
  vaultCategory: z.string().regex(/^[0-9a-f]{64}$/),
  assetCategory: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  title: z.string().min(1).max(120),
  tx: hex.max(400_000),
  sources: hex.max(400_000),
  lead: z.array(hex.max(40_000)).min(1).max(4),
  need: z.number().int().min(1).max(16),
  required: z.array(z.string().regex(/^[0-9a-f]{40}$/)).max(16),
});
export type Proposal = z.infer<typeof proposalSchema>;

const approvalSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{64}$/),
  publicKey: z.string().regex(/^0[23][0-9a-f]{64}$/),
  signature: z.string().regex(/^[0-9a-f]{18,148}$/),
});
export type ApprovalCode = z.infer<typeof approvalSchema>;

const keySchema = z.object({
  publicKey: z.string().regex(/^0[23][0-9a-f]{64}$/),
  name: z.string().max(40).optional(),
});

const vennSchema = z.object({
  /** Absent in codes made before Mainnet support: those are Chipnet Venns. */
  network: z.enum(['chipnet', 'mainnet']).default('chipnet'),
  vaultCategory: z.string().regex(/^[0-9a-f]{64}$/),
  assetCategory: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  name: z.string().min(1).max(40),
});

const encode = (prefix: string, value: unknown) =>
  prefix +
  binToBase64(utf8ToBin(JSON.stringify(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/[=]+$/, '');
const decode = <T,>(prefix: string, schema: z.ZodType<T>, text: string, what: string): T => {
  const body = text.trim();
  if (!body.startsWith(prefix)) throw new Error(`This is not a Venn ${what} code.`);
  const b64 = body.slice(prefix.length).replaceAll('-', '+').replaceAll('_', '/');
  let value: unknown;
  try {
    value = JSON.parse(binToUtf8(base64ToBin(b64 + '='.repeat((4 - (b64.length % 4)) % 4)) as Uint8Array));
  } catch {
    throw new Error('Part of this code is missing or changed. Copy the whole code again.');
  }
  const result = schema.safeParse(value);
  if (!result.success) throw new Error('This code was changed or made by a different version of Venn.');
  return result.data;
};

const serializeSources = (sources: Output[]) => binToHex(concat(...sources.map(encodeOutput)));

/** The proposal for a draft built by buildVote / buildRecoveryRequest / buildRecoveryCancelByVote. */
export const proposalFor = (
  kind: ProposalKind,
  draft: Draft,
  title: string,
  need: number,
  required: string[] = [],
): Proposal => {
  if (!draft.venn || draft.venn.fn !== kind) throw new Error('Not a group decision');
  return proposalSchema.parse({
    v: 1,
    network: draft.venn.params.network,
    kind,
    vaultCategory: draft.venn.params.vaultCategory,
    ...(draft.venn.params.assetCategory ? { assetCategory: draft.venn.params.assetCategory } : {}),
    title: title.slice(0, 120),
    tx: binToHex(encodeTransaction(draft.tx)),
    sources: serializeSources(draft.sources),
    lead: draft.venn.lead.map(binToHex),
    need,
    required,
  });
};

/** The id every approval names: the hash of the unsigned transaction. */
export const proposalId = (p: Proposal) => binToHex(sha256(hexToBin(p.tx)));

export const paramsOf = (p: Pick<Proposal, 'network' | 'vaultCategory' | 'assetCategory'>): VennParams => ({
  network: p.network,
  vaultCategory: p.vaultCategory,
  ...(p.assetCategory ? { assetCategory: p.assetCategory } : {}),
});

/** Rebuilds the draft a proposal describes. */
export const draftOf = (p: Proposal): Draft => {
  const tx = decodeTransaction(hexToBin(p.tx));
  const sources = decodeOutputs(hexToBin(p.sources));
  if (sources.length !== tx.inputs.length) throw new Error('This proposal is damaged.');
  if (tx.inputs.some(i => i.unlockingBytecode.length)) throw new Error('This proposal is damaged.');
  const fee =
    sources.reduce((a, o) => a + o.value, 0n) - tx.outputs.reduce((a, o) => a + o.value, 0n);
  return {
    tx,
    sources,
    fee,
    venn: { params: paramsOf(p), fn: p.kind as VennFunction, lead: p.lead.map(hexToBin) },
  };
};

export const encodeProposal = (p: Proposal) => encode(PROPOSAL, proposalSchema.parse(p));
export const decodeProposal = (text: string): Proposal => decode(PROPOSAL, proposalSchema, text, 'proposal');

export const encodeApproval = (a: ApprovalCode) => encode(APPROVAL, approvalSchema.parse(a));
export const decodeApproval = (text: string): ApprovalCode => decode(APPROVAL, approvalSchema, text, 'approval');

/** A person's Venn key, to add them as a member or to give their seat a new key. */
export const encodeKeyCode = (publicKey: string, name?: string) =>
  encode(KEY, keySchema.parse({ publicKey, ...(name ? { name: name.slice(0, 40) } : {}) }));
export const decodeKeyCode = (text: string) => {
  const trimmed = text.trim();
  if (/^0[23][0-9a-f]{64}$/.test(trimmed)) return { publicKey: trimmed };
  return decode(KEY, keySchema, trimmed, 'key');
};

/** A Venn's identity, so a new phone can follow it while its recovery completes. */
export const encodeVennCode = (v: z.input<typeof vennSchema>) => encode(VENN, vennSchema.parse(v));
export const decodeVennCode = (text: string) => decode(VENN, vennSchema, text, 'Venn');

/** Approves a proposal: the Venn key's signature over the transaction (ALL|UTXOS). */
export const approvalFor = (p: Proposal, publicKey: string, signature: Uint8Array): ApprovalCode => ({
  id: proposalId(p),
  publicKey,
  signature: binToHex(signature),
});

/** Checks an approval belongs to this proposal and is signed by that key. */
export const checkApproval = (p: Proposal, a: ApprovalCode): boolean =>
  a.id === proposalId(p) && checkVennSignature(draftOf(p), hexToBin(a.signature), a.publicKey);

// ---------------------------------------------------------------------------------------
// What a proposal does, from the transaction itself

export interface Described {
  lines: string[];
  /** For a recovery request: the seat freeze and who can stop it, shown before anyone signs. */
  warning?: { text: string; danger: boolean };
  /** Key hashes whose cards are inputs and may sign this proposal. */
  signers: string[];
  fee: bigint;
}

const roleText = (roles: number) =>
  [
    roles & ROLE.SPEND ? 'spends alone' : '',
    roles & ROLE.VOTE ? 'votes' : '',
    roles & ROLE.REQUIRED ? 'must sign every vote' : '',
    roles & ROLE.HELPER ? 'helps recover keys' : '',
  ]
    .filter(Boolean)
    .join(', ') || 'no roles';

const RULE_TEXT = ['locked', 'a majority', 'everyone'];

const outpointKey = (o: { txid: string; vout: number }) => `${o.txid}:${o.vout}`;

/**
 * Explains a proposal in plain words, after checking every Venn coin it spends is one of the
 * Venn's current coins exactly as described. Throws when the proposal is out of date or does
 * not belong to this Venn.
 */
export function describeProposal(
  p: Proposal,
  coins: VennCoins,
  names: Record<string, string>,
  money: (amount: bigint) => string,
  network: Network,
): Described {
  if (p.network !== network) throw new Error(`This proposal is for ${p.network}, and this wallet is on ${network}.`);
  const draft = draftOf(p);
  const params = paramsOf(p);
  const lock = vennLocking(params);
  const moneyLock = moneyLocking(params);
  const current = new Map<string, Utxo>(
    [coins.rules, ...coins.cards, ...coins.money].map(u => [outpointKey(u), u]),
  );
  draft.tx.inputs.forEach((input, i) => {
    const source = draft.sources[i];
    const ours = equal(source.lockingBytecode, lock) || equal(source.lockingBytecode, moneyLock);
    if (!ours) return;
    const coin = current.get(outpointKey(input));
    if (!coin || coin.value !== source.value || !equal(coin.lockingBytecode, source.lockingBytecode) ||
      JSON.stringify(coin.token ?? null, (_, v) => (typeof v === 'bigint' ? v.toString() : v)) !==
        JSON.stringify(source.token ?? null, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
      throw new Error('This proposal is out of date: the Venn has changed since it was made. Ask whoever proposed it to tap Refresh and re-propose, then open the new one.');
  });
  if (outpointKey(draft.tx.inputs[0]) !== outpointKey(coins.rules)) throw new Error('This proposal does not lead with this Venn’s rules.');

  const nameOf = (pkh: string) => names[pkh] ?? `the member ${pkh.slice(0, 8)}…`;
  const cardIn = (i: number): CardState | null => {
    const t = draft.sources[i].token;
    if (!equal(draft.sources[i].lockingBytecode, lock) || t?.nft?.capability !== 'mutable') return null;
    return decodeCardState(t.nft.commitment);
  };
  const signers = draft.sources
    .map((_, i) => cardIn(i))
    .filter((c): c is CardState => Boolean(c && c.recovery === 0))
    .filter(c => (p.kind === 'recoveryRequest' ? c.roles & ROLE.HELPER : c.roles & ROLE.VOTE))
    .map(c => c.pkh);
  const lines: string[] = [];

  if (p.kind === 'recoveryRequest' || p.kind === 'recoveryCancelByVote') {
    const changed = draft.tx.outputs.findIndex((o, i) => {
      const before = cardIn(i);
      return before && o.token?.nft && o.token.nft.commitment !== draft.sources[i].token!.nft!.commitment;
    });
    if (changed < 1) throw new Error('This proposal changes no seat.');
    const before = cardIn(changed)!;
    const after = decodeCardState(draft.tx.outputs[changed].token!.nft!.commitment);
    if (p.kind === 'recoveryRequest') {
      lines.push(`Give ${nameOf(before.pkh)}’s seat a new key (${after.newPkh.slice(0, 8)}…).`);
      const warning = recoveryWarning(p, names);
      if (warning) return { lines, signers, fee: draft.fee, warning };
    } else {
      lines.push(`Stop the recovery request waiting on ${nameOf(before.pkh)}’s seat.`);
    }
  } else {
    const rulesBefore = decodeRulesState(draft.sources[0].token!.nft!.commitment);
    const rulesAfter = decodeRulesState(draft.tx.outputs[0].token!.nft!.commitment);
    describeRules(rulesBefore, rulesAfter, lines);
    const plan = draft.venn!.lead[1];
    let out = 1;
    draft.tx.inputs.forEach((_, i) => {
      const before = i > 0 ? cardIn(i) : null;
      if (!before) return;
      if (plan[i - 1] === 1) {
        lines.push(`Remove ${nameOf(before.pkh)}.`);
        return;
      }
      const after = decodeCardState(draft.tx.outputs[out++].token!.nft!.commitment);
      if (after.roles !== before.roles) lines.push(`${nameOf(before.pkh)} now ${roleText(after.roles)}.`);
      if (after.budgetMode !== before.budgetMode || after.budget !== before.budget || after.period !== before.period || after.cap !== before.cap)
        lines.push(
          after.budgetMode === 0
            ? `${nameOf(before.pkh)} no longer has a budget.`
            : `${nameOf(before.pkh)}’s budget becomes ${money(after.budget)} every ${Number(after.period) / 86_400} days` +
                (after.cap ? `, at most ${money(after.cap)} per payment.` : '.'),
        );
    });
    for (let j = out; j < draft.tx.outputs.length; j++) {
      const o = draft.tx.outputs[j];
      if (equal(o.lockingBytecode, lock) && o.token?.nft) {
        const c = decodeCardState(o.token.nft.commitment);
        lines.push(
          `Add ${nameOf(c.pkh)}, who ${roleText(c.roles)}` +
            (c.budgetMode ? ` with a budget of ${money(c.budget)} every ${Number(c.period) / 86_400} days.` : '.'),
        );
      }
    }
    const feePayer = draft.sources.find(s => !equal(s.lockingBytecode, lock) && !equal(s.lockingBytecode, moneyLock));
    for (const o of draft.tx.outputs.slice(1)) {
      if (equal(o.lockingBytecode, lock) || equal(o.lockingBytecode, moneyLock)) continue;
      if (feePayer && equal(o.lockingBytecode, feePayer.lockingBytecode)) continue;
      const amount = params.assetCategory ? o.token?.category === params.assetCategory ? o.token.amount : 0n : o.value;
      if (amount > 0n)
        lines.push(`Pay ${money(amount)} to ${addressForLockingBytecode(o.lockingBytecode, network, Boolean(o.token))}.`);
    }
  }
  if (!lines.length) throw new Error('This proposal changes nothing.');
  return { lines, signers, fee: draft.fee };
}

function describeRules(before: RulesState, after: RulesState, lines: string[]) {
  const rules: [keyof RulesState, string][] = [
    ['membership', 'Adding or removing members'],
    ['spending', 'Changing budgets'],
    ['recoveryRule', 'Changing recovery'],
    ['governance', 'Changing the rules'],
    ['payments', 'Payments beyond a budget'],
  ];
  for (const [key, label] of rules)
    if (before[key] !== after[key]) lines.push(`${label} will need ${RULE_TEXT[after[key] as number]}.`);
  if (before.recoveryOn !== after.recoveryOn) lines.push(after.recoveryOn ? 'Turn on recovery of lost keys.' : 'Turn off recovery of lost keys.');
  else if (
    after.recoveryOn &&
    (before.helpersNeeded !== after.helpersNeeded || before.waitUnits !== after.waitUnits || before.stopRule !== after.stopRule ||
      before.strongNeeded !== after.strongNeeded || before.strongWaitUnits !== after.strongWaitUnits)
  )
    lines.push(
      `Recovery: ${after.helpersNeeded} helpers and a wait of about ${Math.round((after.waitUnits * 512) / 86_400)} days.`,
    );
}

/** The key hash of a public key, hex. */
/**
 * What a recovery request does to the seat while it waits, and who can stop it, read from the
 * proposal's own transaction (rules at input 0, the target card's new state). Null for others.
 */
export function recoveryWarning(p: Proposal, names: Record<string, string>): { text: string; danger: boolean } | null {
  if (p.kind !== 'recoveryRequest') return null;
  const draft = draftOf(p);
  const lock = vennLocking(paramsOf(p));
  const rules = decodeRulesState(draft.sources[0].token!.nft!.commitment);
  const i = draft.tx.outputs.findIndex(
    (o, n) => n > 0 && equal(o.lockingBytecode, lock) && o.token?.nft && draft.sources[n]?.token?.nft &&
      o.token.nft.commitment !== draft.sources[n].token!.nft!.commitment,
  );
  if (i < 1) return null;
  const before = decodeCardState(draft.sources[i].token!.nft!.commitment);
  const after = decodeCardState(draft.tx.outputs[i].token!.nft!.commitment);
  const name = names[before.pkh] ?? 'this member';
  const strong = rules.stopRule === STOP.BOTH && after.recovery === 2;
  const hours = Math.max(1, Math.round((after.waitUnits * 512) / 3600));
  return freezeWarning(name, hours, whoCanStop(rules.stopRule, rules.voters, (before.roles & ROLE.VOTE) === ROLE.VOTE, strong));
}

/**
 * Whether every Venn coin this proposal spends is still unspent in `coins`. A proposal made from
 * an old view of the Venn (QA 21 Nov, B2) fails this and must be made again.
 */
export function proposalIsCurrent(p: Proposal, coins: VennCoins): boolean {
  const draft = draftOf(p);
  const params = paramsOf(p);
  const ours = [vennLocking(params), moneyLocking(params)];
  const have = new Set([coins.rules, ...coins.cards, ...coins.money].map(outpointKey));
  return draft.tx.inputs.every((input, i) => !ours.some(l => equal(l, draft.sources[i].lockingBytecode)) || have.has(outpointKey(input)));
}

export const pkhOfKey = (publicKey: string) => binToHex(hash160(hexToBin(publicKey)));
