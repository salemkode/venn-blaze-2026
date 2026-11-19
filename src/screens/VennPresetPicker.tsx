// "Create a Venn", step 1: four big cards in a swipeable carousel. The next card peeks in
// from the edge, and each card's diagram draws itself as the card slides to the centre, so the
// cards, their depth and their graphs all move together with the finger.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, ChevronLeft } from 'lucide-react-native';
import Animated, {
  Easing, Extrapolation, interpolate, useAnimatedReaction, useAnimatedRef, useAnimatedStyle,
  useDerivedValue, useReducedMotion, useScrollOffset, useSharedValue, withDelay, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors } from '../ui/theme';
import { TYPES, type VennType } from '../venn/presets';
import { VennPresetDiagram, diagramColors } from './VennPresetDiagram';

const kinds = ['personal', 'shared', 'pot', 'circle'] as const;


const cards: Record<VennType, { explain: string; chart: string; weakness: string }> = {
  personal: {
    explain: 'Your money, with a daily budget that refills. Bigger payments need a vote with friends you trust, and they can give you a new key if you lose your phone.',
    chart: 'Your budget refills over 24 hours',
    weakness: 'Friends can replace a lost key. Enough of them together could take over after the wait.',
  },
  shared: {
    explain: 'For a household or a team. Everyone spends alone from their own refilling budget. Bigger payments need a majority vote.',
    chart: 'You spend 20 · Sam still has 50',
    weakness: 'Anyone can spend their whole budget at once, and a majority can outvote you.',
  },
  pot: {
    explain: 'Collect together for one goal, like a trip or a gift. Nobody spends alone: every payment needs a majority vote.',
    chart: 'Two of three votes approve a payment',
    weakness: 'Slow: money stays in the Pot until enough people vote.',
  },
  circle: {
    explain: 'A savings circle (jam’eya). Everyone pays the same each round, and the contract pays the whole pot to whoever’s turn it is.',
    chart: 'One payout per round, in turn',
    weakness: 'The contract fixes the turns and the amount, but cannot make anyone pay.',
  },
};

const GAP = 12;
const PEEK = 40;

function PresetCard({ kind, index, offset, interval, cardWidth, intro, reduced, onPick, onFocus }: {
  kind: VennType;
  index: number;
  offset: SharedValue<number>;
  interval: number;
  cardWidth: number;
  intro: SharedValue<number>;
  reduced: boolean;
  onPick(kind: VennType): void;
  onFocus(index: number): void;
}) {
  const { ink, surface, secondary, accent } = diagramColors[kind];
  const { explain, chart, weakness } = cards[kind];
  const title = TYPES[kind].title;

  // How far this card is from the centre: 0 when centred, 1 one card away.
  const distance = useDerivedValue(() =>
    interval ? Math.min(1, Math.abs(offset.value - index * interval) / interval) : 0);
  // The graph draws in as the card arrives and un-draws as it leaves.
  const progress = useDerivedValue(() => reduced
    ? 1
    : Math.min(intro.value, interpolate(distance.value, [0, 0.8], [1, 0], Extrapolation.CLAMP)));
  const card = useAnimatedStyle(() => reduced ? {} : {
    opacity: interpolate(distance.value, [0, 1], [1, 0.7]),
    transform: [{ scale: interpolate(distance.value, [0, 1], [1, 0.94]) }],
  });
  // Text drifts a little slower than the card for depth.
  const drift = useAnimatedStyle(() => {
    if (reduced || !interval) return {};
    const side = (offset.value - index * interval) / interval;
    return { transform: [{ translateX: interpolate(side, [-1, 0, 1], [-36, 0, 36], Extrapolation.CLAMP) }] };
  });

  return <Pressable accessible={false} onPress={() => onFocus(index)} style={{ width: cardWidth }}>
    <Animated.View style={[s.card, { backgroundColor: surface }, card]}>
      <Animated.View style={[s.cardTop, drift]}>
        <View style={s.titleRow}>
          <Text accessibilityRole="header" style={[s.title, { color: ink }]}>{title}</Text>
        </View>
        <Text style={[s.explain, { color: ink }]}>{explain}</Text>
      </Animated.View>

      <View style={s.figure} accessible accessibilityLabel={`Example: ${chart}`}>
        <Text style={[s.chart, { color: secondary }]}>{chart}</Text>
        <View style={s.drawing} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <VennPresetDiagram kind={kind} progress={progress} />
        </View>
      </View>

      <Animated.View style={drift}>
        <View style={[s.weakness, { borderColor: secondary + '55' }]}>
          <Text style={[s.weaknessLabel, { color: accent === ink ? secondary : accent }]}>Weakness</Text>
          <Text style={[s.weaknessText, { color: ink }]}>{weakness}</Text>
        </View>
      </Animated.View>

      <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${title}`} testID={`venn-type-${kind}`}
        onPress={() => onPick(kind)} style={({ pressed }) => [s.choose, { backgroundColor: ink }, pressed && s.pressed]}>
        <Text style={[s.chooseLabel, { color: surface }]}>Choose {title}</Text>
        <ArrowRight size={19} color={surface} />
      </Pressable>
    </Animated.View>
  </Pressable>;
}

function PageDot({ index, offset, interval, ink }: {
  index: number; offset: SharedValue<number>; interval: number; ink: string;
}) {
  const dot = useAnimatedStyle(() => {
    const d = interval ? Math.min(1, Math.abs(offset.value / interval - index)) : index ? 1 : 0;
    return { width: interpolate(d, [0, 1], [24, 8]), opacity: interpolate(d, [0, 1], [1, 0.25]) };
  });
  return <Animated.View style={[s.dot, { backgroundColor: ink }, dot]} />;
}

export function VennPresetPicker({ onPick, onBack }: { onPick(kind: VennType): void; onBack(): void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const pager = useAnimatedRef<Animated.ScrollView>();
  const offset = useScrollOffset(pager);
  const intro = useSharedValue(reduced ? 1 : 0);

  const cardWidth = Math.min(width - 2 * (PEEK + GAP / 2), 520);
  const interval = cardWidth + GAP;
  const side = (width - cardWidth) / 2;

  // The first card draws its graph once on arrival; after that the graphs follow the swipe.
  useEffect(() => {
    if (!reduced) intro.set(withDelay(180, withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) })));
  }, [intro, reduced]);

  useAnimatedReaction(
    () => Math.max(0, Math.min(kinds.length - 1, Math.round(offset.value / interval))),
    (index, previous) => { if (index !== previous) scheduleOnRN(setActive, index); },
  );
  const focus = useCallback((index: number) => {
    pager.current?.scrollTo({ x: index * interval, animated: !reduced });
  }, [interval, pager, reduced]);

  return <View testID="create-venn" style={[s.root, { paddingTop: insets.top, paddingBottom: Math.max(12, insets.bottom) }]}>
    <View style={[s.header, { paddingLeft: Math.max(16, insets.left), paddingRight: Math.max(16, insets.right) }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={8} style={s.back}>
        <ChevronLeft size={26} color={colors.ink} />
      </Pressable>
      <View style={s.headerText}>
        <Text accessibilityRole="header" style={s.heading}>Create a Venn</Text>
        <Text style={s.step}>Step 1 of 4 · Swipe to compare</Text>
      </View>
      <View style={s.back} />
    </View>

    <Animated.ScrollView
      ref={pager}
      horizontal
      snapToInterval={interval}
      decelerationRate="fast"
      disableIntervalMomentum
      directionalLockEnabled
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      contentInsetAdjustmentBehavior="never"
      accessibilityLabel={`Kinds of Venn, ${active + 1} of ${kinds.length}: ${TYPES[kinds[active]].title}`}
      style={s.pager}
      contentContainerStyle={{ paddingHorizontal: side, gap: GAP, paddingVertical: 10 }}
    >
      {kinds.map((kind, i) => <PresetCard key={kind} kind={kind} index={i} offset={offset} interval={interval}
        cardWidth={cardWidth} intro={intro} reduced={reduced} onPick={onPick} onFocus={focus} />)}
    </Animated.ScrollView>

    <View style={s.dots}>
      {kinds.map((kind, i) => <Pressable key={kind} accessibilityRole="button"
        accessibilityLabel={`Show ${TYPES[kind].title}`}
        accessibilityState={{ selected: active === i }} hitSlop={10} onPress={() => focus(i)}>
        <PageDot index={i} offset={offset} interval={interval} ink={colors.ink} />
      </Pressable>)}
    </View>
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, alignItems: 'center' },
  heading: { fontSize: 17, fontWeight: '600', color: colors.ink },
  step: { fontSize: 12, fontWeight: '500', color: colors.muted, marginTop: 2 },
  pager: { flex: 1 },
  card: {
    flex: 1, borderRadius: 32, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 18, gap: 14,
    overflow: 'hidden',
  },
  cardTop: { gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontSize: 38, fontWeight: '700', letterSpacing: -1.5, flexShrink: 1 },
  badge: { borderWidth: 1.5, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  explain: { fontSize: 16, lineHeight: 22 },
  figure: { flex: 1, minHeight: 120, justifyContent: 'center', gap: 6 },
  chart: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2, textTransform: 'uppercase' },
  drawing: { flex: 1, maxHeight: 230, width: '100%' },
  weakness: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 3 },
  weaknessLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  weaknessText: { fontSize: 15, lineHeight: 21 },
  choose: {
    minHeight: 54, paddingHorizontal: 22, borderRadius: 27, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center', gap: 12,
  },
  chooseSoon: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', justifyContent: 'center' },
  chooseLabel: { flexShrink: 1, fontSize: 17, fontWeight: '600' },
  pressed: { opacity: 0.75 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, height: 30 },
  dot: { height: 8, borderRadius: 4 },
});
