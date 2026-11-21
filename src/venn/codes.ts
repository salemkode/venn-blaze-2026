// What kind of Venn code someone pasted, so "Join a Venn" can take an invitation or the code of
// a Venn they were already added to, and explain any other code instead of failing on it.
// Also: when a member's Venn key has too little BCH to pay network fees.

export type CodeKind = 'invite' | 'venn' | 'proposal' | 'approval' | 'key' | 'accept' | 'unknown';

const PREFIXES: [string, CodeKind][] = [
  ['venn:invite:', 'invite'],
  ['venn:venn:', 'venn'],
  ['venn:proposal:', 'proposal'],
  ['venn:approval:', 'approval'],
  ['venn:key:', 'key'],
  ['venn:accept:', 'accept'],
];

/** The kind of a pasted code. Tolerates surrounding text, like a message that contains the code. */
export function codeKind(text: string): CodeKind {
  const t = text.trim();
  const found = PREFIXES.map(([p, kind]) => ({ kind, at: t.indexOf(p) }))
    .filter(x => x.at >= 0)
    .sort((a, b) => a.at - b.at)[0];
  return found ? found.kind : 'unknown';
}

/** The code itself, starting at its prefix, from a pasted message. */
export function extractCode(text: string): string {
  const t = text.trim();
  const at = PREFIXES.map(([p]) => t.indexOf(p))
    .filter(i => i >= 0)
    .sort((a, b) => a - b)[0];
  return at === undefined ? t : t.slice(at).split(/\s/)[0];
}

/** Why a code can't be used on the Join screen, or '' when it can. */
export function joinRefusal(kind: CodeKind): string {
  switch (kind) {
    case 'invite':
    case 'venn':
      return '';
    case 'proposal':
      return 'This is a proposal to approve, not an invitation. Open Venns, then Approve a proposal.';
    case 'approval':
      return 'This is an approval for whoever made the proposal. Send it back to them.';
    case 'accept':
      return 'This is an acceptance code. The person who invited you pastes it on their plan.';
    case 'key':
      return 'This is a Venn key code. A helper uses it to move a seat to a new phone.';
    default:
      return 'This doesn’t look like a Venn code. Paste the whole invitation or Venn code you received.';
  }
}

/**
 * Sats a Venn key should hold to pay its own network fees: a budget payment costs about 1,000
 * sats of fee plus a 1,000 sat token output, and a vote or recovery a little more.
 */
export const LOW_FEE_BALANCE = 3_000n;

/** Whether to prompt a member to add BCH for fees. Unknown balances don't prompt. */
export const needsFees = (keyBalance: bigint | null) => keyBalance !== null && keyBalance < LOW_FEE_BALANCE;
