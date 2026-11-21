// First-run story of a Venn, told as one piece of motion. The three rings are three
// people; the green they share is their money. They lock it into a contract, one spends
// within a budget, two of three approve a bigger move, two helpers give a lost phone a
// new key, and everyone signs off on rules that match the official contract. Voting and
// recovery scenes say plainly that the app does not offer them yet.
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  type ViewStyle,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { ArrowRight, BadgeCheck, Check, KeyRound, Lock, Store } from 'lucide-react-native';
import BrandMark, { MarkLens } from '../ui/BrandMark';
import { APP_NAME, MARK, brand, markCentres } from '../ui/brand';
import { colors } from '../ui/theme';

// Actors are drawn on a 320 stage, scaled down on short screens.
const STAGE = 320;
const MID = STAGE / 2;
const BOX = 260; // the mark's 1000 box drawn at this size
const K = BOX / 1000;
const RING = 2 * MARK.radius * K + MARK.stroke * K;
const MARK_AT = markCentres(MARK.offset * K);
const SPREAD_AT = markCentres(MARK.offset * K * 4.2);
// Check badges sit on each person's outer edge.
const BADGE_AT = markCentres(MARK.offset * K + MARK.radius * K);
// The budget scene shows the Venn small, on the left.
const SMALL = 0.55;
const VAULT_X = -96;

// Copy matches this build: Venns run on Chipnet with test money and on Mainnet with MUSD;
// budgets, votes, recovery and Circles all work in the app.
export const SCENES: { key: string; title?: string; body: string; note?: string }[] = [
  {
    key: 'circle',
    body: 'A Bitcoin Cash wallet for money you share. Each shared fund is a Venn, held by rules everyone agreed to.',
  },
  {
    key: 'vault',
    title: 'A Venn is a contract.',
    body: 'Shared money sits in a Bitcoin Cash contract. The network enforces its rules, so no company, not even us, can override them.',
    note: 'Chipnet: Venn Test USD, test money · Mainnet: MUSD, real money',
  },
  {
    key: 'budget',
    title: 'Spend alone, within a budget.',
    body: 'Each member can pay on their own up to a budget that refills over time. The contract rejects anything above it.',
  },
  {
    key: 'vote',
    title: 'Bigger moves need a vote.',
    body: 'Larger payments, Pot payouts and rule changes need the group to approve. One member proposes; the others approve from their own phones.',
    note: 'Proposals travel as codes you share',
  },
  {
    key: 'recover',
    title: 'Lose your phone, not your place.',
    body: 'Helpers you chose can move your seat to a new key after a waiting period, and you can stop a request you did not ask for.',
    note: 'Your recovery phrase is still your first backup',
  },
  {
    key: 'rules',
    title: 'Nothing hidden.',
    body: 'Everyone sees every rule, and its weakness, before joining. The contract is not yet security audited.',
  },
];
const LAST = SCENES.length - 1;

/** Where every actor rests in scene `i`. */
function targets(i: number) {
  const key = SCENES[i].key;
  const at = (x, y, s = 1, o = 1) => ({ x, y, s, o });
  const rings =
    key === 'budget'
      ? MARK_AT.map(([x, y]) => at(VAULT_X + x * SMALL, y * SMALL, SMALL))
      : MARK_AT.map(([x, y], n) => (key === 'recover' && n === 0 ? at(x, y, 0.92, 0.25) : at(x, y)));
  return {
    rings,
    lens: key === 'budget' ? SMALL : 1,
    lensX: key === 'budget' ? VAULT_X : 0,
    lock: key === 'vault',
    guard: key === 'vault' || key === 'recover',
    coin: key === 'budget',
    checks: key === 'vote' ? [1, 1, 0] : key === 'recover' ? [0, 1, 1] : key === 'rules' ? [1, 1, 1] : [0, 0, 0],
    key: key === 'recover',
    vote: key === 'vote',
    wait: key === 'recover',
    badge: key === 'rules',
  };
}

function useActors() {
  const [actors] = useState(() => {
    const v = n => new Animated.Value(n);
    return {
      rings: SPREAD_AT.map(([x, y]) => ({
        x: v(x),
        y: v(y),
        s: v(0.4),
        o: v(0),
      })),
      lens: v(0),
      lensX: v(0),
      lock: v(0),
      guard: v(0),
      coin: v(0),
      checks: [v(0), v(0), v(0)],
      key: v(0),
      vote: v(0),
      wait: v(0),
      badge: v(0),
      progress: SCENES.map((_, n) => v(n === 0 ? 1 : 0)),
      spin: v(0),
      travel: v(0.5),
    };
  });
  return actors;
}

/** Text that rises into place when it mounts. */
function Rise({
  delay = 0,
  reduce,
  style,
  children,
}: {
  delay?: number;
  reduce: boolean | null;
  style?: any;
  children?: React.ReactNode;
}) {
  const [v] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => {
    if (reduce) return;
    Animated.timing(v, {
      toValue: 1,
      duration: 560,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v, delay, reduce]);
  const translateY = v.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

function Wordmark({ reduce }: { reduce: boolean | null }) {
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={APP_NAME} style={s.wordmark}>
      {[...APP_NAME].map((letter, n) => (
        <Rise key={n} delay={520 + n * 55} reduce={reduce}>
          <Text style={s.wordmarkLetter}>{letter}</Text>
        </Rise>
      ))}
    </View>
  );
}

export default function Onboarding({
  busy = false,
  network,
  onCreate,
  onRestore,
  onConnect,
  localKeys = true,
  onDone,
}: {
  busy?: boolean;
  network: string;
  onCreate?: () => void;
  onRestore?: () => void;
  onConnect?: () => void;
  localKeys?: boolean;
  /** Replay from Settings: the last scene shows Done instead of the wallet choices. */
  onDone?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const a = useActors();
  const [index, setIndex] = useState(0);
  const [reduce, setReduce] = useState<boolean | null>(null);
  const running = useRef<any>(null);
  const indexRef = useRef(0);
  const zoom = Math.min(1, Math.max(0.72, (height * 0.4) / STAGE));

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(on => live && setReduce(on))
      .catch(() => live && setReduce(false));
    return () => {
      live = false;
    };
  }, []);

  // Background loops: the guard and the circle turn, the coin travels.
  useEffect(() => {
    if (reduce !== false) return undefined;
    const loops = [
      Animated.loop(
        Animated.timing(a.spin, {
          toValue: 1,
          duration: 16000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(a.travel, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(a.travel, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.delay(450),
        ]),
      ),
    ];
    loops.forEach(loop => loop.start());
    return () => loops.forEach(loop => loop.stop());
  }, [a, reduce]);

  function play(i, intro = false) {
    const t = targets(i);
    const spring = (v, toValue) =>
      reduce
        ? Animated.timing(v, { toValue, duration: 0, useNativeDriver: true })
        : Animated.spring(v, {
            toValue,
            damping: 15,
            stiffness: 140,
            mass: 1,
            useNativeDriver: true,
          });
    const fade = (v, on, delay = 0) =>
      Animated.timing(v, {
        toValue: on ? 1 : 0,
        duration: reduce ? 0 : on ? 420 : 220,
        delay: reduce || !on ? 0 : delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
    const steps = a.rings.map((ring, n) => {
      const g = t.rings[n];
      return Animated.sequence([
        Animated.delay(reduce ? 0 : n * (intro ? 120 : 45)),
        Animated.parallel([
          spring(ring.x, g.x),
          spring(ring.y, g.y),
          spring(ring.s, g.s),
          Animated.timing(ring.o, {
            toValue: g.o,
            duration: reduce ? 0 : 300,
            useNativeDriver: true,
          }),
        ]),
      ]);
    });
    steps.push(
      reduce || !t.lens
        ? spring(a.lens, t.lens)
        : Animated.sequence([Animated.delay(intro ? 620 : 140), spring(a.lens, t.lens)]),
      spring(a.lensX, t.lensX),
      fade(a.lock, t.lock, 380),
      fade(a.guard, t.guard, 160),
      fade(a.coin, t.coin, 420),
      ...a.checks.map((check, n) => fade(check, t.checks[n], 420 + n * 260)),
      fade(a.key, t.key, 1100),
      fade(a.vote, t.vote, 900),
      fade(a.wait, t.wait, 300),
      fade(a.badge, t.badge, 1000),
      ...a.progress.map((bar, n) =>
        Animated.timing(bar, {
          toValue: n <= i ? 1 : 0,
          duration: reduce ? 0 : 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    );
    running.current?.stop();
    running.current = Animated.parallel(steps);
    running.current.start();
  }

  // The opening: rings fly in from the edges and lock into the mark.
  useEffect(() => {
    if (reduce === null) return;
    play(indexRef.current, indexRef.current === 0);
    // play reads only refs and reduce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  function go(next) {
    const i = Math.max(0, Math.min(LAST, next));
    if (i === indexRef.current) return;
    indexRef.current = i;
    setIndex(i);
    play(i);
  }

  // eslint-disable-next-line react-hooks/refs -- PanResponder reads the scene ref only in gesture callbacks, never during initialization.
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -40) go(indexRef.current + 1);
        else if (g.dx > 40) go(indexRef.current - 1);
      },
    }),
  );

  const scene = SCENES[index];
  const last = index === LAST;
  const turnBack = a.spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-360deg'],
  });
  const coinX = a.travel.interpolate({
    inputRange: [0, 1],
    outputRange: [-96, 96],
  });
  const coinY = a.travel.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, -40, -56, -40, 0],
  });
  const coinScale = a.travel.interpolate({
    inputRange: [0, 0.12, 0.88, 1],
    outputRange: [0.3, 1, 1, 0.3],
  });
  const budgetLeft = a.travel.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.62],
  });
  const pop = v => ({
    opacity: v,
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
  });

  return (
    <View
      testID="onboarding"
      style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      {...pan.panHandlers}
    >
      <StatusBar barStyle="light-content" />
      <View style={s.top}>
        <View style={s.progress}>
          {a.progress.map((bar, n) => (
            <View key={n} style={s.track}>
              <Animated.View style={[s.fill, { transform: [{ scaleX: bar }] }]} />
            </View>
          ))}
        </View>
        {last ? (
          <View style={s.skip} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip introduction"
            testID="onboarding-skip"
            hitSlop={12}
            onPress={() => go(LAST)}
            style={s.skip}
          >
            <Text style={s.skipText}>Skip</Text>
          </Pressable>
        )}
      </View>

      <View
        style={[s.stageFrame, { height: STAGE * zoom }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={[s.stage, { transform: [{ scale: zoom }] }]}>
          <Animated.View style={[centre(250), { opacity: a.guard, transform: [{ rotate: turnBack }] }]}>
            <Svg width={250} height={250}>
              <Circle cx={125} cy={125} r={116} stroke={brand.line} strokeWidth={2} strokeDasharray="3 9" fill="none" />
              <Circle cx={125} cy={9} r={6} fill={brand.green} />
            </Svg>
          </Animated.View>

          <Animated.View
            style={[
              centre(BOX),
              {
                transform: [{ translateX: a.lensX }, { scale: a.lens }],
              },
            ]}
          >
            <MarkLens size={BOX} id="stageLens" />
          </Animated.View>

          {a.rings.map((ring, n) => (
            <Animated.View
              key={n}
              style={[
                s.ring,
                {
                  opacity: ring.o,
                  transform: [{ translateX: ring.x }, { translateY: ring.y }, { scale: ring.s }],
                },
              ]}
            />
          ))}

          <Animated.View style={[centre(40), pop(a.lock)]}>
            <Lock size={26} color={brand.greenInk} strokeWidth={2.6} />
          </Animated.View>

          <Animated.View style={[centre(52), s.shop, { opacity: a.coin, transform: [{ translateX: 96 }] }]}>
            <Store size={24} color={brand.ink} strokeWidth={2} />
          </Animated.View>
          <Animated.View
            style={[
              centre(22),
              s.coin,
              {
                opacity: a.coin,
                transform: [{ translateX: coinX }, { translateY: coinY }, { scale: coinScale }],
              },
            ]}
          />
          <Animated.View style={[s.meter, { opacity: a.coin }]}>
            <Text style={s.caption}>Your budget today</Text>
            <View style={s.meterTrack}>
              <Animated.View style={[s.meterFill, { transform: [{ scaleX: budgetLeft }] }]} />
            </View>
          </Animated.View>

          {a.checks.map((check, n) => (
            <Animated.View
              key={n}
              style={[
                centre(30),
                s.check,
                {
                  opacity: check,
                  transform: [
                    { translateX: BADGE_AT[n][0] },
                    { translateY: BADGE_AT[n][1] },
                    {
                      scale: check.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.4, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Check size={18} color={brand.greenInk} strokeWidth={3.2} />
            </Animated.View>
          ))}

          <Animated.View
            style={[
              centre(56),
              {
                opacity: a.key,
                transform: [
                  { translateY: MARK_AT[0][1] - 40 },
                  {
                    scale: a.key.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.6, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <KeyRound size={34} color={brand.green} strokeWidth={2.4} />
          </Animated.View>

          <Animated.View style={[s.captionRow, { opacity: a.vote }]}>
            <Text style={s.caption}>2 of 3 approved</Text>
          </Animated.View>
          <Animated.View style={[s.captionRow, { opacity: a.wait }]}>
            <Text style={s.caption}>Waiting period · then the new key works</Text>
          </Animated.View>
          <Animated.View style={[s.captionRow, pop(a.badge)]}>
            <View style={s.badge}>
              <BadgeCheck size={16} color={brand.green} strokeWidth={2.4} />
              <Text style={s.badgeText}>Official contract</Text>
            </View>
          </Animated.View>
        </View>
      </View>

      <View style={s.copy} key={scene.key}>
        {scene.title ? (
          <Rise reduce={reduce}>
            <Text accessibilityRole="header" style={s.title}>
              {scene.title}
            </Text>
          </Rise>
        ) : (
          <Wordmark reduce={reduce} />
        )}
        <Rise delay={scene.title ? 110 : 1000} reduce={reduce}>
          <Text style={s.body}>{scene.body}</Text>
        </Rise>
        {scene.note ? (
          <Rise delay={240} reduce={reduce} style={s.note}>
            <View style={s.noteDot} />
            <Text style={s.noteText}>{scene.note}</Text>
          </Rise>
        ) : null}
      </View>

      <View style={s.actions}>
        {last && onDone ? (
          <Rise delay={250} reduce={reduce}>
            <Pressable
              accessibilityRole="button"
              testID="onboarding-done"
              onPress={onDone}
              style={({ pressed }) => [s.primary, pressed && s.pressed]}
            >
              <Text style={s.primaryText}>Done</Text>
            </Pressable>
          </Rise>
        ) : last ? (
          <Rise delay={250} reduce={reduce}>
            <View style={s.network}>
              <View style={[s.networkDot, network === 'mainnet' && { backgroundColor: colors.amber }]} />
              <Text style={s.networkText}>
                {network === 'chipnet'
                  ? 'Chipnet · test coins, no real money'
                  : 'Mainnet · real BCH · Venns hold MUSD'}
              </Text>
            </View>
            {localKeys ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                testID="onboarding-create"
                disabled={busy}
                onPress={onCreate}
                style={({ pressed }) => [s.primary, pressed && s.pressed]}
              >
                <Text style={s.primaryText}>{busy ? 'Creating wallet…' : 'Create a new wallet'}</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                testID="onboarding-connect"
                disabled={busy}
                onPress={onConnect}
                style={({ pressed }) => [s.primary, pressed && s.pressed]}
              >
                <Text style={s.primaryText}>Connect a wallet</Text>
              </Pressable>
            )}
            {!localKeys ? (
              <Pressable
                accessibilityRole="link"
                testID="onboarding-live-venn"
                onPress={() => router.push('/live')}
                style={({ pressed }) => [s.secondary, pressed && s.pressed]}
              >
                <Text style={s.secondaryText}>See a live Venn on Mainnet, no wallet needed</Text>
              </Pressable>
            ) : null}
            {localKeys ? (
              <Pressable
                accessibilityRole="button"
                testID="onboarding-restore"
                disabled={busy}
                onPress={onRestore}
                style={({ pressed }) => [s.outline, pressed && s.pressed]}
              >
                <Text style={s.secondaryText}>Restore with a recovery phrase</Text>
              </Pressable>
            ) : null}
            {localKeys && onConnect ? (
              <Pressable
                accessibilityRole="button"
                testID="onboarding-connect"
                disabled={busy}
                onPress={onConnect}
                style={({ pressed }) => [s.secondary, pressed && s.pressed]}
              >
                <Text style={s.secondaryText}>Connect a wallet you already use</Text>
              </Pressable>
            ) : null}
          </Rise>
        ) : (
          <View style={s.navRow}>
            {index > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                accessibilityHint="Shows the previous scene."
                testID="onboarding-back"
                hitSlop={10}
                onPress={() => go(index - 1)}
                style={({ pressed }) => [s.back, pressed && s.pressed]}
              >
                <Text style={s.backText}>Back</Text>
              </Pressable>
            ) : (
              <View style={s.back}>
                <BrandMark size={34} id="onboardingCorner" />
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next"
              testID="onboarding-next"
              onPress={() => go(index + 1)}
              style={({ pressed }) => [s.next, pressed && s.pressed]}
            >
              <Text style={s.nextText}>Next</Text>
              <ArrowRight size={20} color={brand.night} strokeWidth={2.4} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const centre = (size: number): ViewStyle => ({
  position: 'absolute',
  left: MID - size / 2,
  top: MID - size / 2,
  width: size,
  height: size,
  alignItems: 'center',
  justifyContent: 'center',
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.night },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    height: 52,
  },
  progress: { flex: 1, flexDirection: 'row', gap: 6 },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: brand.line,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
    backgroundColor: brand.ink,
    transformOrigin: 'left',
  },
  skip: { width: 64, alignItems: 'flex-end' },
  skipText: { color: brand.soft, fontSize: 15, fontWeight: '600' },
  stageFrame: { alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  stage: { width: STAGE, height: STAGE },
  ring: {
    position: 'absolute',
    left: MID - RING / 2,
    top: MID - RING / 2,
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: MARK.stroke * K,
    borderColor: brand.ink,
  },
  coin: {
    borderRadius: 11,
    backgroundColor: brand.green,
    shadowColor: brand.green,
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  shop: {
    borderRadius: 16,
    backgroundColor: brand.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.line,
  },
  meter: {
    position: 'absolute',
    left: MID - 110,
    top: MID + 74,
    width: 220,
  },
  meterTrack: {
    height: 8,
    borderRadius: 4,
    marginTop: 8,
    backgroundColor: brand.line,
    overflow: 'hidden',
  },
  meterFill: {
    flex: 1,
    borderRadius: 4,
    backgroundColor: brand.green,
    transformOrigin: 'left',
  },
  check: {
    borderRadius: 15,
    backgroundColor: brand.green,
    borderWidth: 3,
    borderColor: brand.night,
  },
  captionRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: MID + 118,
    alignItems: 'center',
  },
  caption: {
    color: brand.soft,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: brand.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.line,
  },
  badgeText: { color: brand.ink, fontSize: 13, fontWeight: '700' },
  copy: { flex: 1, paddingHorizontal: 28, paddingTop: 12 },
  wordmark: { flexDirection: 'row', marginBottom: 12 },
  wordmarkLetter: {
    color: brand.ink,
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  title: {
    color: brand.ink,
    fontSize: 32,
    lineHeight: 37,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 14,
  },
  body: { color: brand.soft, fontSize: 17, lineHeight: 25 },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.line,
    backgroundColor: brand.surface,
  },
  noteDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: brand.green },
  noteText: { color: brand.soft, fontSize: 13, fontWeight: '600' },
  actions: { paddingHorizontal: 24, paddingBottom: 16 },
  navRow: { flexDirection: 'row', alignItems: 'center' },
  back: { width: 88, height: 56, justifyContent: 'center' },
  backText: { color: brand.soft, fontSize: 16, fontWeight: '600' },
  next: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    backgroundColor: brand.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextText: { color: brand.night, fontSize: 17, fontWeight: '700' },
  network: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    marginBottom: 16,
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: brand.green,
  },
  networkText: { color: brand.soft, fontSize: 13 },
  primary: {
    height: 56,
    borderRadius: 28,
    backgroundColor: brand.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: brand.greenInk, fontSize: 17, fontWeight: '700' },
  outline: {
    height: 56,
    marginTop: 10,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: brand.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    height: 52,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: brand.ink, fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
