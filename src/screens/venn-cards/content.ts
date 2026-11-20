// Copy, colours, geometry and motion maths for the "Create a Venn" cards.
// Everything here is plain data or a worklet, so the same numbers drive the UI thread and the
// unit tests. The design is the final prototype in prototypes/create-venn/concepts/09-final.js.
import type { VennType } from '../../venn/presets';

/**
 * Kinds that can be explored but not created yet. Empty: all four can be created. Adding a kind
 * here gives its card a "Coming soon" pill and an inert button; nothing else changes.
 */
export const COMING_SOON: ReadonlySet<VennType> = new Set<VennType>();
export const canCreate = (kind: VennType) => !COMING_SOON.has(kind);
export const SOON_NOTE = 'Coming soon';

export const MEMBERS = ['You', 'Sam', 'Lee'] as const;
export const BACKDROP = '#0B0B0D';

export interface Part { label: string; title: string; body: string }
export interface Kind {
  id: VennType;
  title: string;
  line: string;
  colors: { surface: string; ink: string; secondary: string; accent: string; light: boolean };
  parts: [Part, Part, Part, Part];
}

export const KINDS: Kind[] = [
  {
    id: 'personal',
    title: 'Personal',
    line: 'Your money, guarded by people you trust.',
    colors: { surface: '#0B0B0D', ink: '#FFFFFF', secondary: '#BEC2C3', accent: '#19D39B', light: true },
    parts: [
      { label: 'What it is', title: 'Your own money, with a safety net.', body: 'You hold it. Two friends you trust stand behind you, not beside you.' },
      { label: 'Who spends alone', title: 'You, from a budget that refills.', body: 'Say 50 Venn Test USD a day. Spend it all and half is back in 12 hours.' },
      { label: 'Bigger payments', title: 'Above your budget, a friend approves.', body: 'A larger payment needs your vote plus one friend’s.' },
      { label: 'Weakness', title: 'Friends can replace a lost key.', body: 'Enough of them together could take over your place after the waiting period.' },
    ],
  },
  {
    id: 'shared',
    title: 'Shared',
    line: 'For a household, a couple or a team.',
    colors: { surface: '#E2F4EA', ink: '#123B2C', secondary: '#3E6252', accent: '#16805C', light: false },
    parts: [
      { label: 'What it is', title: 'One fund, everyone’s own budget.', body: 'Groceries, rent, team tools. Each person gets a daily budget from the same money.' },
      { label: 'Who spends alone', title: 'Each person, within their budget.', body: 'You pay 20 for groceries. You have 30 left. Sam still has 50.' },
      { label: 'Bigger payments', title: 'A majority decides the big ones.', body: 'Two of three approve anything above a budget, and any change to the rules.' },
      { label: 'Weakness', title: 'Budgets can be spent all at once.', body: 'Anyone can use their full budget in one go, and a majority can outvote you.' },
    ],
  },
  {
    id: 'pot',
    title: 'Pot',
    line: 'Collect together for one goal.',
    colors: { surface: '#ECE8FF', ink: '#332259', secondary: '#5D5173', accent: '#6A4DF5', light: false },
    parts: [
      { label: 'What it is', title: 'Everyone adds, nobody holds.', body: 'Save together for a trip, a gift or a project.' },
      { label: 'Who spends alone', title: 'Nobody. Not even you.', body: 'There are no personal budgets. Money stays locked in the Pot.' },
      { label: 'Every payment', title: 'Two of three votes pay the deposit.', body: 'Your vote leaves it pending. Sam’s vote approves it.' },
      { label: 'Weakness', title: 'Slow when people are away.', body: 'Nothing moves until enough people vote.' },
    ],
  },
  {
    id: 'circle',
    title: 'Circle',
    line: 'A jam’eya: take turns receiving the pot.',
    colors: { surface: '#FFF3D9', ink: '#493613', secondary: '#725B32', accent: '#A6620B', light: false },
    parts: [
      { label: 'What it is', title: 'Pay in together, take turns.', body: 'Each round everyone pays the same amount, and one member receives the whole pot.' },
      { label: 'Who spends alone', title: 'Nobody. The pot goes round.', body: 'You first, then Sam, then Lee. The contract fixes the order and the amount.' },
      { label: 'Each payout', title: 'No vote: the contract pays out.', body: 'Once everyone has paid in, the whole pot goes to whoever’s turn it is.' },
      { label: 'Weakness', title: 'Paying in is a promise.', body: 'Nothing can make anyone pay. Every missed payment is recorded for everyone to see.' },
    ],
  },
];

// ------------------------------------------------------------------ geometry and timing
/** The graph canvas, in its own units; it is scaled to the card's width. */
export const GW = 327, GH = 250, CX = GW / 2;
export const ROW_Y = 72, NODE_R = 30, HUB_Y = 178, HUB_R = 32;
export const nodeX = (i: number) => 61.5 + i * 102;
export const ARC_LEN = 2 * Math.PI * NODE_R;
export const LOCK_LEN = 2 * Math.PI * (HUB_R + 7);

// Handoff. For the first EXIT_F of a step the top card travels exactly with the finger; for the
// rest only the card underneath settles. In finger space those stretches are EXIT_PX and TAIL_PX.
export const LIFT_S = 0.94, UNDER_S = 0.96, RADIUS = 32, DIM = 0.1;
export const EXIT_PX = 372, TAIL_PX = 44, UNIT_PX = EXIT_PX + TAIL_PX;
export const EXIT_F = 0.53, EXIT_U = EXIT_PX / UNIT_PX, LIFT_F = 0.07;
export const PX_P = 230;       // drag distance for one part
export const NUDGE = 12;       // reduced motion: how far a card follows the finger

export const OPEN_GROW = 500;  // 1 px → pill → full screen
export const G_STEP = 55, G_DUR = 240, G_START = OPEN_GROW - 40;
export const OPEN_END = G_START + 4 * G_STEP + G_DUR;
export const ACT_START = G_START + 2 * G_STEP + 120;
export const ACT_MS = 600;     // a landed card's graph plays its part once
export const WALK_MS = 700;    // a tap walks one whole part
export const OPEN_DONE = 1e9;  // the opening is over

// ------------------------------------------------------------------ maths (worklets)
export function clamp(v: number, a = 0, b = 1) {
  'worklet';
  return Math.min(b, Math.max(a, v));
}
export function lerp(a: number, b: number, t: number) {
  'worklet';
  return a + (b - a) * t;
}
export function ramp(v: number, a: number, b: number) {
  'worklet';
  return clamp((v - a) / (b - a));
}
export function smooth(t: number) {
  'worklet';
  return t * t * (3 - 2 * t);
}
export function easeOut(t: number) {
  'worklet';
  return 1 - Math.pow(1 - t, 3);
}
export function easeInOut(t: number) {
  'worklet';
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
/** Resistance past the first and last card. */
export function rubber(v: number, lo: number, hi: number, gain: number, stiff: number) {
  'worklet';
  if (v < lo) { const o = lo - v; return lo - (o * gain) / (1 + o * stiff); }
  if (v > hi) { const o = v - hi; return hi + (o * gain) / (1 + o * stiff); }
  return v;
}
/** Finger space (linear in pixels) → kind position. */
export function warp(x: number) {
  'worklet';
  if (x <= 0) return (x * EXIT_F) / EXIT_U;
  if (x >= 3) return 3 + ((x - 3) * EXIT_F) / EXIT_U;
  const i = Math.floor(x), u = x - i;
  return i + (u <= EXIT_U ? (u / EXIT_U) * EXIT_F : EXIT_F + ((u - EXIT_U) / (1 - EXIT_U)) * (1 - EXIT_F));
}
/** Kind position → finger space. */
export function unwarp(k: number) {
  'worklet';
  if (k <= 0) return (k * EXIT_U) / EXIT_F;
  if (k >= 3) return 3 + ((k - 3) * EXIT_U) / EXIT_F;
  const i = Math.floor(k), f = k - i;
  return i + (f <= EXIT_F ? (f / EXIT_F) * EXIT_U : EXIT_U + ((f - EXIT_F) / (1 - EXIT_F)) * (1 - EXIT_U));
}
/** The opening, `ms` in: a dot becomes a pill, the pill becomes the screen. */
export function seedBox(ms: number, W: number, H: number, originY: number) {
  'worklet';
  const g = clamp(ms / OPEN_GROW);
  const pill = easeOut(ramp(g, 0, 0.34)), grow = easeInOut(ramp(g, 0.18, 1)), tall = Math.pow(grow, 1.5);
  const w = 1 + 139 * pill + (W - 140) * grow, h = 1 + 43 * pill + (H - 44) * tall;
  const cy = lerp(originY, H / 2, tall);
  const r = Math.min(w, h) / 2 > 34 ? 34 * (1 - ramp(grow, 0.7, 1)) : Math.min(w, h) / 2;
  return { x: (W - w) / 2, y: cy - h / 2, w, h, r };
}

/**
 * Where a card sits in the stack for kind position k. `f` is k minus the card's index:
 * 0 lying on the glass, > 0 lifted and leaving to the left, < 0 underneath and settling. The
 * first card has nothing above it, so pulling it right lifts it instead (the rubber band).
 */
export function cardPose(f: number, W: number, first = false) {
  'worklet';
  if (f >= 0 || first) {
    const lift = smooth(ramp(Math.abs(f), 0, LIFT_F));
    return { show: f < EXIT_F, tx: -f * (EXIT_PX / EXIT_F) * (W / 375), s: lerp(1, LIFT_S, lift), r: RADIUS * lift, dim: 0, top: true };
  }
  if (f > -0.9999) {
    const e = smooth(1 + f);
    return { show: true, tx: 0, s: lerp(UNDER_S, 1, e), r: RADIUS * (1 - e), dim: DIM * (1 - e), top: false };
  }
  return { show: false, tx: 0, s: UNDER_S, r: RADIUS, dim: DIM, top: false };
}

// ------------------------------------------------------------------ graph timelines
// A keyframe is the whole picture at a part position `at`: n - 0.5 is the "before" picture of
// part n, n is what happens in it. Nobody changes place; only state does. Per person:
// o(pacity), f (holds the pot), d(ashed: away or replaced), c(heck: voted), a/ao (budget arc and
// its opacity), v/vo (number and its opacity). Per link to the money: s(olid), d(ashed), t (drawn).
type NodeState = { o: number; f: number; d: number; c: number; a: number; ao: number; v: number; vo: number };
type LinkState = { s: number; d: number; t: number };
type Key = { at: number; cap: string; n: Partial<NodeState>[]; l: LinkState[]; hub: number; label: string; lock?: number; coin?: number };

const NODE_KEYS = ['o', 'f', 'd', 'c', 'a', 'ao', 'v', 'vo'] as const;
const NODE_DEFAULT: NodeState = { o: 1, f: 0, d: 0, c: 0, a: 1, ao: 0, v: 50, vo: 0 };
const OFF = { s: 0, d: 0, t: 0 }, SOLID = { s: 1, d: 0, t: 1 }, DASH = { s: 0, d: 1, t: 1 }, FAINT = { s: 0, d: 0.4, t: 1 };
const NONE = [OFF, OFF, OFF], ALL = [SOLID, SOLID, SOLID], ASK = [DASH, DASH, DASH];
const plain = [{}, {}, {}];
const VOTED = { c: 1 };
const key = (at: number, cap: string, n: Partial<NodeState>[], l: LinkState[], hub: number, label: string, x: Partial<Key> = {}): Key =>
  ({ at, cap, n, l, hub, label, ...x });
// A vote reads the same on every card: nobody yet, your vote (held so "pending" can be read), Sam's.
const vote = (label: string, pending: string, done: string, o: { n?: Partial<NodeState>[]; l?: LinkState[]; x?: Partial<Key> } = {}) => [
  key(1.5, '', o.n ?? plain, o.l ?? ASK, 0, label),
  key(1.64, pending, [VOTED, {}, {}], [SOLID, DASH, DASH], 0.28, label),
  key(1.8, pending, [VOTED, {}, {}], [SOLID, DASH, DASH], 0.28, label),
  key(2, done, [VOTED, VOTED, {}], [SOLID, SOLID, DASH], 1, label, o.x),
];

const TIMELINES: Record<VennType, () => Key[]> = {
  personal() {
    const net = [SOLID, DASH, DASH], quiet = [SOLID, FAINT, FAINT];
    const back = { o: 0.5 };
    const budget = (a: number, v: number) => [{ a, v, ao: 1, vo: 1 }, back, back];
    const c0 = 'You hold it · friends stand behind';
    const c1 = 'All spent · half back in 12 hours';
    const c3 = 'Together they can take your place';
    return [
      key(-0.5, '', plain, NONE, 1, 'Venn'),
      key(-0.2, c0, plain, [SOLID, OFF, OFF], 1, 'Venn'),
      key(0, c0, plain, net, 1, 'Venn'),
      key(0.5, 'Your budget · 50 a day', budget(1, 50), quiet, 1, 'Venn'),
      key(0.74, c1, budget(0, 0), quiet, 1, 'Venn'),
      key(1, c1, budget(0.5, 25), quiet, 1, 'Venn'),
      ...vote('You + 1', 'Pending · needs one friend', 'Approved · you and Sam', { n: [{ a: 0.5, v: 25 }, {}, {}], l: net }),
      key(2.5, '', plain, net, 1, 'Venn'),
      key(2.72, c3, [{ d: 1, o: 0.6 }, {}, {}], [FAINT, DASH, DASH], 1, 'Venn'),
      key(3, c3, [{ d: 1, o: 0.6 }, {}, {}], [FAINT, SOLID, SOLID], 1, 'Venn'),
    ];
  },
  shared() {
    const full = { ao: 1, vo: 1 };
    const each = 'Each has 50 a day';
    return [
      key(-0.5, '', plain, NONE, 1, 'Fund'),
      key(0, 'One fund · three people', plain, ALL, 1, 'Fund'),
      key(0.5, each, [full, full, full], ALL, 1, 'Fund'),
      key(1, 'You pay 20 for groceries', [{ a: 0.6, v: 30, ao: 1, vo: 1 }, full, full], ALL, 1, 'Fund'),
      ...vote('2 of 3', 'Pending · 1 of 3', 'Approved · 2 of 3', { n: [{ a: 0.6, v: 30 }, {}, {}] }),
      key(2.5, each, [full, full, full], ALL, 1, 'Fund'),
      key(3, 'Sam spends all 50 at once', [full, { a: 0, v: 0, ao: 1, vo: 1 }, full], ALL, 1, 'Fund'),
    ];
  },
  pot() {
    const dim = { o: 0.5 }, away = { d: 1, o: 0.5 };
    return [
      key(-0.5, '', plain, NONE, 0, 'Pot'),
      key(0, 'Everyone adds', plain, ALL, 1, 'Pot'),
      key(0.5, 'No personal budgets', [dim, dim, dim], NONE, 1, 'Pot'),
      key(1, 'Locked in the Pot', [dim, dim, dim], NONE, 1, 'Pot', { lock: 1 }),
      ...vote('2 of 3', 'Pending · 1 of 3', 'Approved · deposit paid', { x: { coin: 1 } }),
      key(2.5, '', plain, ASK, 0, '2 of 3'),
      key(3, 'Waiting for one more vote', [VOTED, away, away], [SOLID, FAINT, FAINT], 0.28, '2 of 3'),
    ];
  },
  circle() {
    const turn = (i: number) => [0, 1, 2].map(j => ({ f: j === i ? 1 : 0, vo: 1 }));
    const paid = { c: 1 };
    const c0 = 'Everyone pays in · You receive';
    const c1 = 'The pot goes round in this order';
    const c3 = 'Nothing makes Lee pay in';
    return [
      key(-0.5, '', plain, NONE, 0, 'Pot'),
      key(-0.2, c0, plain, ALL, 1, 'Pot'),
      key(0, c0, [{ f: 1 }, {}, {}], ALL, 0, 'Pot'),
      key(0.5, c1, turn(0), ALL, 0, 'Pot'),
      key(0.75, c1, turn(1), ALL, 0, 'Pot'),
      key(1, c1, turn(2), ALL, 0, 'Pot'),
      // Each payout: people pay in one by one; once all have paid, the pot goes to You.
      key(1.5, '', plain, NONE, 0, 'Round 1'),
      key(1.64, 'Waiting for Lee', [paid, paid, {}], [SOLID, SOLID, DASH], 0.66, 'Round 1'),
      key(1.8, 'Waiting for Lee', [paid, paid, {}], [SOLID, SOLID, DASH], 0.66, 'Round 1'),
      key(2, 'Everyone paid · You receive', [{ c: 1, f: 1 }, paid, paid], ALL, 0, 'Round 1'),
      key(2.5, '', plain, NONE, 0, 'Pot'),
      key(2.74, c3, plain, [SOLID, SOLID, OFF], 0.45, 'Pot'),
      key(3, c3, [{}, {}, { d: 1, o: 0.55 }], [SOLID, SOLID, FAINT], 0.45, 'Pot'),
    ];
  },
};

/**
 * A kind's timeline, flattened for the UI thread. Each frame is
 * [at, cap, label, hub, lock, coin, ...3 people × 8, ...3 links × 3]; cap and label index into
 * `caps` and `labels`.
 */
export interface Scene { frames: number[][]; caps: string[]; labels: string[] }
export const FRAME_HEAD = 6, FRAME_NODE = FRAME_HEAD, FRAME_LINK = FRAME_HEAD + 24;

export function compileScene(kind: VennType): Scene {
  const caps: string[] = [], labels: string[] = [];
  const index = (list: string[], s: string) => {
    const i = list.indexOf(s);
    return i >= 0 ? i : list.push(s) - 1;
  };
  const frames = TIMELINES[kind]().map(k => [
    k.at, index(caps, k.cap), index(labels, k.label), k.hub, k.lock ?? 0, k.coin ?? 0,
    ...[0, 1, 2].flatMap(j => NODE_KEYS.map(n => k.n[j]?.[n] ?? NODE_DEFAULT[n])),
    ...[0, 1, 2].flatMap(j => [k.l[j].s, k.l[j].d, k.l[j].t]),
  ]);
  return { frames, caps, labels };
}

/**
 * The scene at part position q: the frame before, the frame after and the eased mix between
 * them. Values are interpolated; text (caption and money label) swaps at the halfway point.
 */
export function sceneAt(frames: number[][], q: number) {
  'worklet';
  const first = frames[0][0], last = frames[frames.length - 1][0];
  const at = clamp(q, first, last);
  let i = 0;
  while (i < frames.length - 2 && at > frames[i + 1][0]) i++;
  const A = frames[i], B = frames[i + 1];
  const t = smooth(clamp((at - A[0]) / (B[0] - A[0])));
  const v: number[] = [];
  for (let k = 0; k < A.length; k++) v.push(A[k] + (B[k] - A[k]) * t);
  return { v, t, capA: A[1], capB: B[1], labelA: A[2], labelB: B[2] };
}

/** How visible text `index` is when a frame pair swaps from `a` to `b` at mix t. */
export function swapAlpha(index: number, a: number, b: number, t: number) {
  'worklet';
  if (a === b) return index === a ? 1 : 0;
  const shown = t < 0.5 ? a : b;
  return index === shown ? Math.abs(1 - 2 * t) : 0;
}

/** The number above a person: budget left, or a Circle turn. */
export function nodeNumber(kind: VennType, j: number, v: number) {
  'worklet';
  if (kind === 'circle') return ['1st', '2nd', '3rd'][j];
  return v >= 49.5 ? '50' : `${Math.round(v)}/50`;
}
