// The graph on every card: You, Sam and Lee in a fixed row and the money underneath. Nobody
// moves; links, budget arcs, votes and the money's fill change with the part position `q`.
import { useMemo } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Rect, Text } from 'react-native-svg';
import type { VennType } from '../../venn/presets';
import {
  ARC_LEN, CX, FRAME_LINK, FRAME_NODE, GH, GW, HUB_R, HUB_Y, LOCK_LEN, MEMBERS, NODE_R, ROW_Y,
  compileScene, easeOut, lerp, nodeNumber, nodeX, ramp, sceneAt, swapAlpha, type Kind,
} from './content';

const ACircle = Animated.createAnimatedComponent(Circle);
const ALine = Animated.createAnimatedComponent(Line);
const APath = Animated.createAnimatedComponent(Path);
const AText = Animated.createAnimatedComponent(Text);
const AG = Animated.createAnimatedComponent(G);
const AInput = Animated.createAnimatedComponent(TextInput);

type Frame = SharedValue<ReturnType<typeof sceneAt>>;
type Colors = Kind['colors'];
// Index of a person's value in a frame: o f d c a ao v vo.
function N(j: number, k: number) {
  'worklet';
  return FRAME_NODE + j * 8 + k;
}
const O = 0, F = 1, D = 2, C = 3, A = 4, AO = 5, V = 6, VO = 7;

function Link({ j, s, colors }: { j: number; s: Frame; colors: Colors }) {
  const dx = CX - nodeX(j), dy = HUB_Y - ROW_Y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  const x1 = nodeX(j) + ux * (NODE_R + 7), y1 = ROW_Y + uy * (NODE_R + 7);
  const ex = CX - ux * (HUB_R + 7) - x1, ey = HUB_Y - uy * (HUB_R + 7) - y1;
  const solid = useAnimatedProps(() => {
    const v = s.value.v, t = v[FRAME_LINK + j * 3 + 2];
    return { x2: x1 + ex * t, y2: y1 + ey * t, opacity: v[FRAME_LINK + j * 3] };
  });
  const dashed = useAnimatedProps(() => {
    const v = s.value.v, t = v[FRAME_LINK + j * 3 + 2];
    return { x2: x1 + ex * t, y2: y1 + ey * t, opacity: v[FRAME_LINK + j * 3 + 1] };
  });
  return <>
    <ALine x1={x1} y1={y1} x2={x1} y2={y1} stroke={colors.ink} strokeWidth={2.5} strokeLinecap="round" animatedProps={solid} />
    <ALine x1={x1} y1={y1} x2={x1} y2={y1} stroke={colors.ink} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="5 7" animatedProps={dashed} />
  </>;
}

function Person({ j, s, colors }: { j: number; s: Frame; colors: Colors }) {
  const x = nodeX(j);
  const tx = x + NODE_R * 0.72, ty = ROW_Y - NODE_R * 0.72;
  const fill = useAnimatedProps(() => ({ opacity: s.value.v[N(j, O)] * s.value.v[N(j, F)] }));
  const solid = useAnimatedProps(() => ({ opacity: s.value.v[N(j, O)] * (1 - s.value.v[N(j, D)]) }));
  const dashed = useAnimatedProps(() => ({ opacity: s.value.v[N(j, O)] * s.value.v[N(j, D)] }));
  const arc = useAnimatedProps(() => {
    const v = s.value.v;
    return { opacity: v[N(j, A)] > 0.004 ? v[N(j, AO)] : 0, strokeDashoffset: ARC_LEN * (1 - v[N(j, A)]) };
  });
  // Holding the pot fills the ring; the name flips from ink to the card's colour.
  const nameInk = useAnimatedProps(() => ({ opacity: s.value.v[N(j, O)] * (1 - ramp(s.value.v[N(j, F)], 0.5, 0.8)) }));
  const nameOn = useAnimatedProps(() => ({ opacity: s.value.v[N(j, O)] * ramp(s.value.v[N(j, F)], 0.5, 0.8) }));
  const tick = useAnimatedProps(() => {
    const c = s.value.v[N(j, C)];
    return { opacity: ramp(c, 0, 0.3), r: 11 * lerp(0.4, 1, easeOut(ramp(c, 0, 0.6))) };
  });
  const mark = useAnimatedProps(() => {
    const c = s.value.v[N(j, C)];
    return { opacity: ramp(c, 0, 0.3), strokeDashoffset: 18 * (1 - ramp(c, 0.35, 1)) };
  });
  const name = (fill: string, props: typeof nameInk) =>
    <AText x={x} y={ROW_Y + 5.3} textAnchor="middle" fontSize={15} fontWeight="700" fill={fill} animatedProps={props}>{MEMBERS[j]}</AText>;
  return <>
    <ACircle cx={x} cy={ROW_Y} r={NODE_R} fill={colors.accent} opacity={0} animatedProps={fill} />
    <ACircle cx={x} cy={ROW_Y} r={NODE_R} fill="none" stroke={colors.ink} strokeWidth={2.5} animatedProps={solid} />
    <ACircle cx={x} cy={ROW_Y} r={NODE_R} fill="none" stroke={colors.ink} strokeWidth={2.5} strokeDasharray="2 7" strokeLinecap="round" opacity={0} animatedProps={dashed} />
    <ACircle cx={x} cy={ROW_Y} r={NODE_R} fill="none" stroke={colors.accent} strokeWidth={5} strokeLinecap="round"
      strokeDasharray={[ARC_LEN, ARC_LEN]} rotation={-90} originX={x} originY={ROW_Y} opacity={0} animatedProps={arc} />
    {name(colors.ink, nameInk)}
    {name(colors.surface, nameOn)}
    <ACircle cx={tx} cy={ty} r={4.4} fill={colors.accent} stroke={colors.surface} strokeWidth={2.5} opacity={0} animatedProps={tick} />
    <APath d={`M${tx - 5} ${ty + 0.5}l3.4 3.8 6.8 -7.8`} fill="none" stroke={colors.surface} strokeWidth={2.4}
      strokeLinecap="round" strokeLinejoin="round" strokeDasharray={[18, 18]} opacity={0} animatedProps={mark} />
  </>;
}

export function CardGraph({ kind, colors, q, width }: { kind: VennType; colors: Colors; q: SharedValue<number>; width: number }) {
  const scene = useMemo(() => compileScene(kind), [kind]);
  const frames = scene.frames;
  const s = useDerivedValue(() => sceneAt(frames, q.value));
  const scale = width / GW;
  return <View style={{ width, height: GH * scale }} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
    <Svg width={width} height={GH * scale} viewBox={`0 0 ${GW} ${GH}`}>
      {[0, 1, 2].map(j => <Link key={j} j={j} s={s} colors={colors} />)}
      {kind === 'pot' && <Coin s={s} colors={colors} />}
      <Hub s={s} colors={colors} labels={scene.labels} />
      {kind === 'pot' && <Lock s={s} colors={colors} />}
      {[0, 1, 2].map(j => <Person key={j} j={j} s={s} colors={colors} />)}
      {scene.caps.map((cap, i) => cap ? <Caption key={i} index={i} text={cap} s={s} colors={colors} /> : null)}
    </Svg>
    {[0, 1, 2].map(j => <Amount key={j} j={j} kind={kind} s={s} colors={colors} scale={scale} />)}
  </View>;
}

function Hub({ s, colors, labels }: { s: Frame; colors: Colors; labels: string[] }) {
  const fill = useAnimatedProps(() => ({ opacity: s.value.v[3] }));
  return <>
    <ACircle cx={CX} cy={HUB_Y} r={HUB_R} fill={colors.accent} animatedProps={fill} />
    <Circle cx={CX} cy={HUB_Y} r={HUB_R} fill="none" stroke={colors.accent} strokeWidth={2.5} />
    {labels.map((label, i) => <G key={label}>
      <HubLabel index={i} text={label} s={s} fill={colors.ink} on={false} />
      <HubLabel index={i} text={label} s={s} fill={colors.surface} on />
    </G>)}
  </>;
}

function HubLabel({ index, text, s, fill, on }: { index: number; text: string; s: Frame; fill: string; on: boolean }) {
  const props = useAnimatedProps(() => {
    const f = s.value, m = ramp(f.v[3], 0.5, 0.8);
    return { opacity: swapAlpha(index, f.labelA, f.labelB, f.t) * (on ? m : 1 - m) };
  });
  return <AText x={CX} y={HUB_Y + 5.3} textAnchor="middle" fontSize={15} fontWeight="700" fill={fill} opacity={0} animatedProps={props}>{text}</AText>;
}

function Caption({ index, text, s, colors }: { index: number; text: string; s: Frame; colors: Colors }) {
  const props = useAnimatedProps(() => ({ opacity: swapAlpha(index, s.value.capA, s.value.capB, s.value.t) }));
  return <AText x={CX} y={244} textAnchor="middle" fontSize={15} fontWeight="600" fill={colors.ink} opacity={0} animatedProps={props}>{text}</AText>;
}

function Coin({ s, colors }: { s: Frame; colors: Colors }) {
  const props = useAnimatedProps(() => {
    const out = s.value.v[5];
    return { cx: lerp(CX, CX + 92, out), opacity: ramp(out, 0, 0.25) };
  });
  return <ACircle cx={CX} cy={HUB_Y} r={11} fill={colors.accent} opacity={0} animatedProps={props} />;
}

function Lock({ s, colors }: { s: Frame; colors: Colors }) {
  const ring = useAnimatedProps(() => {
    const lock = s.value.v[4];
    return { strokeDashoffset: LOCK_LEN * (1 - lock), opacity: ramp(lock, 0, 0.1) };
  });
  const badge = useAnimatedProps(() => {
    const lock = s.value.v[4];
    return { r: 13 * lerp(0.4, 1, easeOut(ramp(lock, 0.5, 1))), opacity: ramp(lock, 0.5, 0.8) };
  });
  const icon = useAnimatedProps(() => ({ opacity: ramp(s.value.v[4], 0.65, 0.9) }));
  const bx = CX + 28, by = HUB_Y - 28;
  return <>
    <ACircle cx={CX} cy={HUB_Y} r={HUB_R + 7} fill="none" stroke={colors.ink} strokeWidth={3} strokeLinecap="round"
      strokeDasharray={[LOCK_LEN, LOCK_LEN]} rotation={-90} originX={CX} originY={HUB_Y} opacity={0} animatedProps={ring} />
    <ACircle cx={bx} cy={by} r={5} fill={colors.ink} stroke={colors.surface} strokeWidth={2.5} opacity={0} animatedProps={badge} />
    <AG opacity={0} animatedProps={icon}>
      <Path d={`M${bx - 3.5} ${by - 1.5}v-2.5a3.5 3.5 0 0 1 7 0v2.5`} fill="none" stroke={colors.surface} strokeWidth={2} strokeLinecap="round" />
      <Rect x={bx - 5.5} y={by - 1.5} width={11} height={8} rx={2} fill={colors.surface} />
    </AG>
  </>;
}

/** The number above a person (budget left, or a Circle turn), counted on the UI thread. */
function Amount({ j, kind, s, colors, scale }: { j: number; kind: VennType; s: Frame; colors: Colors; scale: number }) {
  const props = useAnimatedProps(() => {
    const text = nodeNumber(kind, j, s.value.v[N(j, V)]);
    return { text, defaultValue: text } as object;
  });
  const style = useAnimatedStyle(() => ({ opacity: s.value.v[N(j, VO)] }));
  const initial = nodeNumber(kind, j, 50);
  return <Animated.View pointerEvents="none" style={[st.amount, {
    left: (nodeX(j) - 45) * scale, top: (ROW_Y - NODE_R - 13 - 16) * scale, width: 90 * scale, height: 22 * scale,
  }, style]}>
    <AInput editable={false} defaultValue={initial} underlineColorAndroid="transparent" animatedProps={props}
      style={[st.amountText, { color: colors.ink, fontSize: 15 * scale, height: 22 * scale }]} />
  </Animated.View>;
}

const st = StyleSheet.create({
  amount: { position: 'absolute', opacity: 0 },
  amountText: { width: '100%', padding: 0, margin: 0, textAlign: 'center', fontWeight: '600' },
});
