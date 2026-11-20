// "Create a Venn", step 1: four real cards in a stack. The card you look at is the whole screen;
// the next one already lies underneath, a little smaller and dimmer. A sideways drag lifts the
// top card and carries it off with the finger while the card underneath settles; dragging back
// brings the previous card in on top. Each card carries its own back button, title and dots.
// When a card lands its graph acts out the current part once; an up/down drag or a tap steps
// through the four parts. Only two things ever move: the card in your hand and the graph.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowRight, ChevronLeft } from 'lucide-react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing, cancelAnimation, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useFrameCallback,
  useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors } from '../ui/theme';
import type { VennType } from '../venn/presets';
import { CardGraph } from './venn-cards/CardGraph';
import {
  ACT_MS, ACT_START, BACKDROP, G_DUR, G_START, G_STEP, GH, GW, KINDS, NUDGE, OPEN_DONE, OPEN_END, OPEN_GROW,
  PX_P, SOON_NOTE, UNIT_PX, WALK_MS, EXIT_F, canCreate, cardPose, clamp, easeOut, ramp, rubber, seedBox,
  smooth, warp, type Kind,
} from './venn-cards/content';

export { COMING_SOON, canCreate } from './venn-cards/content';

const SPRING = { stiffness: 196, damping: 28, mass: 1 };   // critically damped: no bounce
const OUT = Easing.out(Easing.cubic);
const LINEAR = Easing.linear;
const LIGHT = KINDS.map(kind => kind.colors.light);
const LAST = KINDS.length - 1;

const rgba = (hex: string, a: number) =>
  `rgba(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;

/** Everything that moves, shared by the deck and its cards. */
interface Motion {
  k: SharedValue<number>;       // kind position: 1.5 is halfway from Shared to Pot
  p: SharedValue<number>;       // part position
  open: SharedValue<number>;    // ms into the opening, OPEN_DONE once it is over
  acts: SharedValue<number>[];  // how far each card's graph has played the current part
  nudge: SharedValue<number>;   // reduced motion: px the front card follows the finger
  nudged: SharedValue<number>;
  fade: SharedValue<number>;    // the story fades for jumps between parts
}

export function VennPresetPicker({ onPick, onBack }: { onPick(kind: VennType): void; onBack(): void }) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const unit = (UNIT_PX * W) / 375;   // finger pixels per kind
  const originY = H * 0.56;           // the opening grows from about where "Create a Venn" was

  const x = useSharedValue(0);        // kind position in finger pixels
  const tgtK = useSharedValue(0);
  const p = useSharedValue(0);
  const tgtP = useSharedValue(0);
  const open = useSharedValue(reduced ? OPEN_DONE : 0);
  const a0 = useSharedValue(reduced ? 1 : 0);
  const a1 = useSharedValue(reduced ? 1 : 0);
  const a2 = useSharedValue(reduced ? 1 : 0);
  const a3 = useSharedValue(reduced ? 1 : 0);
  const drag = useSharedValue(0);     // 0 none, 1 sideways (kinds), 2 up/down (parts)
  const x0 = useSharedValue(0);
  const p0 = useSharedValue(0);
  const nudge = useSharedValue(0);
  const nudged = useSharedValue(0);
  const fade = useSharedValue(1);
  const shown = useSharedValue(reduced ? 0 : 1);
  const k = useDerivedValue(() => (reduced ? x.get() / unit : warp(x.get() / unit)));
  const acts = [a0, a1, a2, a3];
  const m: Motion = { k, p, open, acts, nudge, nudged, fade };

  const [active, setActive] = useState(0);
  const [part, setPart] = useState(0);
  const [ready, setReady] = useState(false);
  const [light, setLight] = useState(false);

  useEffect(() => {
    if (reduced) shown.set(withTiming(1, { duration: 220 }));
  }, [reduced, shown]);

  // The clock: the opening, and each card's graph playing its part once it has landed.
  useFrameCallback(frame => {
    const dt = Math.min(34, frame.timeSincePreviousFrame ?? 16);
    let o = open.get();
    if (o < OPEN_DONE) { o = o + dt >= OPEN_END ? OPEN_DONE : o + dt; open.set(o); }
    const kk = k.get();
    for (let i = 0; i < acts.length; i++) {
      const a = acts[i].get();
      let next = a;
      if (reduced) next = 1;
      else if (o < OPEN_DONE) next = i === 0 ? clamp((o - ACT_START) / ACT_MS) : 0;
      else {
        const f = kk - i;
        if (f >= EXIT_F || f <= -0.985) next = 0;
        else if (drag.get() === 0 && f > -0.45 && f < 0.1 && a < 1) next = Math.min(1, a + dt / ACT_MS);
      }
      if (next !== a) acts[i].set(next);
    }
  });

  // ------------------------------------------------------------------ moves (worklets)
  const endIntro = () => {
    'worklet';
    if (open.get() >= OPEN_DONE) return false;
    open.set(OPEN_DONE);
    return true;
  };
  const goKind = (to: number, velocity = 0) => {
    'worklet';
    const target = clamp(to, 0, LAST);
    tgtK.set(target);
    x.set(reduced ? withTiming(target * unit, { duration: 200 }) : withSpring(target * unit, { ...SPRING, velocity }));
  };
  const walkPart = (to: number, ease: typeof LINEAR) => {
    'worklet';
    tgtP.set(to);
    const dist = Math.abs(to - p.get());
    if (dist < 0.001) { cancelAnimation(p); p.set(to); return; }
    p.set(withTiming(to, { duration: Math.max(220, WALK_MS * dist), easing: ease }));
  };
  // A jump (reduced motion, the wrap from the last part to the first, or a far dot) fades the
  // story out, swaps the part and fades it back in.
  const jumpPart = (to: number) => {
    'worklet';
    tgtP.set(to);
    cancelAnimation(p);
    fade.set(withTiming(0, { duration: 110 }, finished => {
      if (!finished) return;
      p.set(to);
      fade.set(withTiming(1, { duration: 180 }));
    }));
  };
  const goPart = (to: number) => {
    'worklet';
    const cur = Math.round(tgtP.get());
    const target = clamp(to, 0, 3);
    if (target === cur) return;
    if (reduced || Math.abs(target - cur) > 1) jumpPart(target);
    else walkPart(target, LINEAR);
  };
  const stepPart = (dir: 1 | -1, wrap: boolean) => {
    'worklet';
    const cur = Math.round(tgtP.get());
    goPart(cur + dir > 3 && wrap ? 0 : cur + dir);
  };

  const pan = usePanGesture({
    minDistance: 8,
    onActivate: e => {
      'worklet';
      endIntro();
      const sideways = Math.abs(e.translationX) > Math.abs(e.translationY);
      drag.set(sideways ? 1 : 2);
      nudged.set(clamp(Math.round(k.get()), 0, LAST));
      if (sideways) { cancelAnimation(x); x0.set(x.get() / unit); } else { cancelAnimation(p); p0.set(p.get()); }
    },
    onUpdate: e => {
      'worklet';
      if (drag.get() === 1) {
        if (reduced) nudge.set(clamp(e.translationX * 0.12, -NUDGE, NUDGE));
        else x.set(rubber(x0.get() - e.translationX / unit, 0, LAST, 0.5, 9) * unit);
      } else if (drag.get() === 2 && !reduced) {
        p.set(rubber(p0.get() - e.translationY / PX_P, 0, 3, 0.55, 2.2));
      }
    },
    onDeactivate: e => {
      'worklet';
      const axis = drag.get();
      drag.set(0);
      if (reduced) {
        nudge.set(withTiming(0, { duration: 140 }));
        if (axis === 1 && (Math.abs(e.translationX) > 40 || Math.abs(e.velocityX) > 400)) {
          goKind(Math.round(tgtK.get()) + (e.translationX < 0 ? 1 : -1));
        }
        if (axis === 2 && Math.abs(e.translationY) > 30) stepPart(e.translationY < 0 ? 1 : -1, false);
        return;
      }
      if (axis === 1) {
        // Go on if the card was carried a third of the way, or flicked.
        const base = clamp(Math.round(x0.get()), 0, LAST);
        const proj = (x.get() - e.velocityX * 0.24) / unit;
        goKind(proj - base > 0.3 ? base + 1 : proj - base < -0.3 ? base - 1 : base, clamp(-e.velocityX, -8 * unit, 8 * unit));
      } else if (axis === 2) {
        const base = clamp(Math.round(p0.get()), 0, 3);
        const proj = p.get() - (e.velocityY * 0.16) / PX_P;
        walkPart(clamp(Math.round(proj), Math.max(0, base - 1), Math.min(3, base + 1)), OUT);
      }
    },
    onFinalize: () => {
      'worklet';
      drag.set(0);
    },
  });

  // ------------------------------------------------------------------ state for React
  // "Choose" only works on a card lying still.
  const settled = useDerivedValue(() =>
    open.get() >= OPEN_DONE && drag.get() === 0 && Math.abs(x.get() - tgtK.get() * unit) < 0.012 * unit);
  useAnimatedReaction(() => settled.get(), (v, prev) => { if (v !== prev) scheduleOnRN(setReady, v); });
  useAnimatedReaction(() => clamp(Math.round(k.get()), 0, LAST), (v, prev) => { if (v !== prev) scheduleOnRN(setActive, v); });
  useAnimatedReaction(() => Math.round(clamp(p.get(), 0, 3)), (v, prev) => { if (v !== prev) scheduleOnRN(setPart, v); });
  // The status bar follows whichever card covers it. During the opening it keeps the previous
  // screen's dark ink until the growing card has passed the clock.
  useAnimatedReaction(() => {
    const o = open.get();
    if (o < OPEN_GROW) {
      const b = seedBox(o, W, H, originY);
      return b.y <= insets.top * 0.45 && b.x <= 34 ? LIGHT[0] : false;
    }
    const kk = k.get();
    if (reduced) {
      const home = clamp(Math.round(kk), 0, LAST);
      return LIGHT[Math.abs(kk - home) < 0.5 ? home : clamp(home + Math.sign(kk - home), 0, LAST)];
    }
    const top = clamp(Math.floor(kk), 0, LAST);
    const pose = cardPose(kk - top, W, top === 0);
    const edge = W / 2 + pose.tx + (W * pose.s) / 2;
    return LIGHT[edge > W / 2 || top === LAST ? top : top + 1];
  }, (v, prev) => { if (v !== prev) scheduleOnRN(setLight, v); });

  const seed = useAnimatedStyle(() => {
    const o = open.get();
    if (o >= OPEN_GROW) return { opacity: 0, width: 0, height: 0, borderRadius: 0, transform: [{ translateX: 0 }, { translateY: 0 }] };
    const b = seedBox(o, W, H, originY);
    return { opacity: 1, width: b.w, height: b.h, borderRadius: b.r, transform: [{ translateX: b.x }, { translateY: b.y }] };
  });
  const backdrop = useAnimatedStyle(() => ({ opacity: open.get() >= OPEN_GROW ? 1 : 0 }));
  const whole = useAnimatedStyle(() => ({ opacity: shown.get() }));

  const tapStory = () => {
    if (endIntro()) return;           // a tap during the opening only finishes it
    stepPart(1, true);
  };
  const choose = (kind: VennType) => {
    if (canCreate(kind) && settled.get()) onPick(kind);
  };

  return <GestureHandlerRootView style={s.root}>
    <StatusBar style={light ? 'light' : 'dark'} animated />
    <GestureDetector gesture={pan}>
      <Animated.View testID="create-venn" style={[s.fill, whole]}>
        <Animated.View style={[s.fill, { backgroundColor: BACKDROP }, backdrop]} />
        {KINDS.map((kind, i) => <DeckCard key={kind.id} kind={kind} index={i} m={m} W={W} H={H} insets={insets}
          reduced={reduced} front={active === i} ready={ready} part={part}
          onBack={onBack} onChoose={choose} onKind={j => goKind(j)} onPart={goPart} onTap={tapStory} />)}
        <Animated.View pointerEvents="none" style={[s.seed, { backgroundColor: KINDS[0].colors.surface }, seed]} />
      </Animated.View>
    </GestureDetector>
  </GestureHandlerRootView>;
}

// -------------------------------------------------------------------- a card
function DeckCard({ kind, index, m, W, H, insets, reduced, front, ready, part, onBack, onChoose, onKind, onPart, onTap }: {
  kind: Kind; index: number; m: Motion; W: number; H: number; insets: EdgeInsets; reduced: boolean;
  front: boolean; ready: boolean; part: number;
  onBack(): void; onChoose(kind: VennType): void; onKind(j: number): void; onPart(j: number): void; onTap(): void;
}) {
  const { k, p, open, acts, nudge, nudged, fade } = m;
  const act = acts[index];
  const c = kind.colors;
  const soon = !canCreate(kind.id);
  const label = kind.id === 'personal' ? c.accent : c.secondary;

  // This card's own copy of the part position and its graph, only updated while it can be seen.
  const pc = useSharedValue(0);
  const q = useSharedValue(index === 0 && !reduced ? -0.5 : 0);
  useAnimatedReaction(() => {
    if (Math.abs(k.get() - index) > 1) return null;
    const pp = clamp(p.get(), 0, 3);
    return [pp, pp - 0.5 * (1 - act.get())];
  }, v => {
    if (!v) return;
    if (v[0] !== pc.get()) pc.set(v[0]);
    if (v[1] !== q.get()) q.set(v[1]);
  });

  const card = useAnimatedStyle(() => {
    const kk = k.get();
    let show = false, tx = 0, sc = 1, r = 0, alpha = 1;
    if (reduced) {
      // No travel: the two cards dissolve into each other; the front one follows the finger a little.
      const home = clamp(Math.round(kk), 0, LAST), away = kk - home, n = nudge.get();
      const other = away > 0 ? home + 1 : away < 0 ? home - 1 : n < 0 ? home + 1 : n > 0 ? home - 1 : -1;
      const t = smooth(Math.min(1, Math.abs(away)));
      if (index === home) { show = true; alpha = other >= 0 && other < home ? 1 : 1 - t; }
      else if (index === other) { show = true; alpha = other < home ? t : 1; }
      if (index === nudged.get()) tx = n;
    } else {
      const pose = cardPose(kk - index, W, index === 0);
      show = pose.show; tx = pose.tx; sc = pose.s; r = pose.r;
    }
    const growing = open.get() < OPEN_GROW;
    return {
      opacity: show && !growing ? alpha : 0,
      borderRadius: r / sc,
      transform: [{ translateX: show ? tx : -3 * W }, { scale: sc }],
    };
  });
  const dim = useAnimatedStyle(() => ({ opacity: reduced ? 0 : cardPose(k.get() - index, W, index === 0).dim }));
  const story = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const nav = useStagger(open, 0), top = useStagger(open, 1), graph = useStagger(open, 2), copy = useStagger(open, 3), cta = useStagger(open, 4);

  // The graph is as wide as the card allows, smaller on short screens.
  const gw = Math.max(220, Math.min(W - 48, 360, ((H - insets.top - insets.bottom - 470) * GW) / GH));

  return <Animated.View style={[s.card, { width: W, height: H, backgroundColor: c.surface, zIndex: KINDS.length - index }, card]}
    accessibilityElementsHidden={!front} importantForAccessibility={front ? 'auto' : 'no-hide-descendants'}>
    <Animated.View style={[{ paddingTop: insets.top }, nav]}>
      <View style={s.navRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={8} style={s.back}>
          <ChevronLeft size={26} color={c.ink} />
        </Pressable>
        <Text style={[s.navTitle, { color: c.ink }]}>Create a Venn</Text>
        <View style={s.back} />
      </View>
      <View style={s.dots}>
        {KINDS.map((other, j) => <Pressable key={other.id} accessibilityRole="button"
          accessibilityLabel={`Show ${other.title}, ${j + 1} of ${KINDS.length}`} accessibilityState={{ selected: j === index }}
          onPress={() => onKind(j)} hitSlop={{ top: 10, bottom: 10 }} style={s.dotHit}>
          <View style={[s.dot, { backgroundColor: c.ink }, j === index ? s.dotOn : s.dotOff]} />
        </Pressable>)}
      </View>
    </Animated.View>

    <Animated.View style={[s.top, top]}>
      <View style={s.head}>
        <Text accessibilityRole="header" style={[s.title, { color: c.ink }]}>{kind.title}</Text>
        {soon && <Text style={[s.soon, { color: c.ink, backgroundColor: rgba(c.accent, 0.14) }]}>{SOON_NOTE}</Text>}
      </View>
      <Text style={[s.line, { color: c.secondary }]}>{kind.line}</Text>
    </Animated.View>

    <Animated.View style={[s.story, story]}>
      <Pressable accessible={false} onPress={onTap} style={s.story}>
        <Animated.View style={[s.graph, graph]}>
          <CardGraph kind={kind.id} colors={c} q={q} width={gw} />
        </Animated.View>
        <Animated.View style={[s.copy, copy]}>
          {kind.parts.map((it, j) => <PartText key={it.label} j={j} pc={pc} current={part === j}
            label={it.label} title={it.title} body={it.body} labelColor={label} ink={c.ink} secondary={c.secondary} />)}
          <View style={s.rail}>
            {kind.parts.map((it, j) => <RailDot key={it.label} j={j} pc={pc} ink={c.ink} label={it.label}
              selected={part === j} onPress={() => onPart(j)} />)}
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>

    <Animated.View style={[s.ctaWrap, { marginBottom: Math.max(insets.bottom, 12) + 8 }, cta]}>
      {soon
        ? <View accessible accessibilityRole="button" accessibilityLabel={`${kind.title}: ${SOON_NOTE}`} accessibilityState={{ disabled: true }}
          testID={`venn-type-${kind.id}`} style={[s.cta, s.ctaSoon, { borderColor: rgba(c.ink, 0.22) }]}>
          <Text style={[s.ctaSoonLabel, { color: c.secondary }]}>{SOON_NOTE}</Text>
        </View>
        : <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${kind.title}`} accessibilityState={{ disabled: !ready }}
          testID={`venn-type-${kind.id}`} onPress={() => onChoose(kind.id)}
          style={({ pressed }) => [s.cta, { backgroundColor: c.ink }, pressed && ready && s.pressed]}>
          <Text style={[s.ctaLabel, { color: c.surface }]}>Choose {kind.title}</Text>
          <ArrowRight size={22} color={c.surface} />
        </Pressable>}
    </Animated.View>

    <Animated.View pointerEvents="none" style={[s.fill, { backgroundColor: BACKDROP }, dim]} />
  </Animated.View>;
}

/** The first card's content arrives in a short stagger once the opening has grown. */
function useStagger(open: SharedValue<number>, j: number) {
  return useAnimatedStyle(() => {
    const o = open.get();
    const u = o >= OPEN_DONE ? 1 : easeOut(ramp(o, G_START + j * G_STEP, G_START + j * G_STEP + G_DUR));
    return { opacity: u, transform: [{ translateY: 10 * (1 - u) }] };
  });
}

/** One part's words. The old part leaves, then the next arrives as the graph reaches its "before". */
function PartText({ j, pc, current, label, title, body, labelColor, ink, secondary }: {
  j: number; pc: SharedValue<number>; current: boolean; label: string; title: string; body: string;
  labelColor: string; ink: string; secondary: string;
}) {
  const style = useAnimatedStyle(() => {
    const d = pc.get() - j;
    let o: number, y: number;
    if (d >= 0) { const u = ramp(d, 0.3, 0.42); o = 1 - u; y = -10 * u; }
    else { const u = ramp(1 + d, 0.42, 0.5); o = u; y = 10 * (1 - u); }
    return { opacity: o, transform: [{ translateY: y }] };
  });
  return <Animated.View style={[s.part, style]} accessible={current} accessibilityElementsHidden={!current}
    importantForAccessibility={current ? 'yes' : 'no-hide-descendants'} accessibilityLabel={`${label}. ${title} ${body}`}>
    <Text style={[s.partLabel, { color: labelColor }]}>{label}</Text>
    <Text style={[s.partTitle, { color: ink }]}>{title}</Text>
    <Text style={[s.partBody, { color: secondary }]}>{body}</Text>
  </Animated.View>;
}

function RailDot({ j, pc, ink, label, selected, onPress }: {
  j: number; pc: SharedValue<number>; ink: string; label: string; selected: boolean; onPress(): void;
}) {
  const style = useAnimatedStyle(() => {
    const near = 1 - clamp(Math.abs(j - pc.get()));
    return { height: 6 + 12 * near, opacity: 0.28 + 0.72 * near };
  });
  return <Pressable accessibilityRole="button" accessibilityLabel={`Show ${label}`} accessibilityState={{ selected }}
    onPress={onPress} hitSlop={{ left: 12, right: 12 }} style={s.railHit}>
    <Animated.View style={[s.railDot, { backgroundColor: ink }, style]} />
  </Pressable>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  seed: { position: 'absolute', left: 0, top: 0 },
  card: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  navRow: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: 18 },
  dotHit: { height: 18, paddingHorizontal: 3, justifyContent: 'center' },
  dot: { height: 6, borderRadius: 3 },
  dotOn: { width: 18, opacity: 1 },
  dotOff: { width: 6, opacity: 0.28 },
  top: { paddingHorizontal: 24, marginTop: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 44, lineHeight: 48, fontWeight: '800', letterSpacing: -1.5, flexShrink: 1 },
  soon: { fontSize: 14, lineHeight: 16, fontWeight: '700', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, overflow: 'hidden', marginTop: 6 },
  line: { marginTop: 6, fontSize: 17, lineHeight: 23 },
  story: { flex: 1 },
  graph: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  copy: { height: 178 },
  part: { position: 'absolute', left: 24, right: 52, top: 8 },
  partLabel: { fontSize: 14, lineHeight: 16, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  partTitle: { marginTop: 8, fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.5 },
  partBody: { marginTop: 8, fontSize: 17, lineHeight: 24 },
  rail: { position: 'absolute', right: 14, top: 10, alignItems: 'center' },
  railHit: { width: 18, height: 24, alignItems: 'center', justifyContent: 'center' },
  railDot: { width: 6, borderRadius: 3 },
  ctaWrap: { paddingHorizontal: 24 },
  cta: {
    height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingLeft: 26, paddingRight: 22,
  },
  ctaLabel: { fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  ctaSoon: { justifyContent: 'center', borderWidth: 1.5, paddingHorizontal: 16 },
  ctaSoonLabel: { fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.8 },
});
