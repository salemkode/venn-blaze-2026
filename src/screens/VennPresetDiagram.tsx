import Animated, { interpolate, useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Rect, Text } from 'react-native-svg';
import { brand } from '../ui/brand';
import { colors } from '../ui/theme';
import type { VennType } from '../venn/presets';

const Dot = Animated.createAnimatedComponent(Circle);
const Segment = Animated.createAnimatedComponent(Line);
const Fill = Animated.createAnimatedComponent(Rect);
const Shape = Animated.createAnimatedComponent(Path);

export const diagramColors = {
  personal: { surface: brand.night, ink: colors.paper, secondary: '#BEC2C3', accent: brand.green },
  shared: { surface: colors.mint, ink: '#123B2C', secondary: '#3E6252', accent: '#16805C' },
  pot: { surface: colors.tokenPaper, ink: '#332259', secondary: '#5D5173', accent: colors.tokenInk },
  circle: { surface: colors.warning, ink: '#493613', secondary: '#725B32', accent: '#A6620B' },
};

type Motion = { progress: SharedValue<number> };

function Refill({ progress }: Motion) {
  const { ink, surface, accent } = diagramColors.personal;
  const head = useAnimatedProps(() => ({ cx: 32 + 266 * progress.value, cy: 138 - 108 * progress.value }));
  const line = useAnimatedProps(() => ({ x2: 32 + 266 * progress.value, y2: 138 - 108 * progress.value }));
  const area = useAnimatedProps(() => {
    const x = 32 + 266 * progress.value;
    return { d: `M32 138 L${x} ${138 - 108 * progress.value} V138 Z` };
  });
  return <>
    {[30, 84, 138].map((y, i) => <G key={y}>
      <Line x1={32} y1={y} x2={298} y2={y} stroke={ink} strokeOpacity={0.24} strokeDasharray="2 5" />
      <Text x={19} y={y + 4} fill={ink} fontSize={12} textAnchor="end">{[50, 25, 0][i]}</Text>
    </G>)}
    <Shape fill={accent} fillOpacity={0.16} animatedProps={area} />
    <Segment x1={32} y1={138} stroke={accent} strokeWidth={4} strokeLinecap="round" animatedProps={line} />
    <Dot r={11} fill={surface} stroke={accent} strokeWidth={3} animatedProps={head} />
    <Dot r={4} fill={accent} animatedProps={head} />
    <G fill={ink} fontSize={12}>
      <Text x={32} y={164}>0 h</Text><Text x={165} y={164} textAnchor="middle">12 h</Text><Text x={298} y={164} textAnchor="end">24 h</Text>
    </G>
  </>;
}

function Budgets({ progress }: Motion) {
  const { ink, accent } = diagramColors.shared;
  const bar = useAnimatedProps(() => ({ width: 284 - 113.6 * progress.value }));
  return <>
    <G fill={ink} fontSize={16} fontWeight="600">
      <Text x={18} y={34}>You</Text><Text x={302} y={34} textAnchor="end">50 → 30</Text>
      <Text x={18} y={116}>Sam</Text><Text x={302} y={116} textAnchor="end">50</Text>
    </G>
    <Rect x={18} y={46} width={284} height={26} rx={13} fill={ink} fillOpacity={0.12} />
    <Fill x={18} y={46} height={26} rx={13} fill={accent} animatedProps={bar} />
    <Rect x={18} y={128} width={284} height={26} rx={13} fill={ink} />
  </>;
}

function Vote({ x, at, progress }: Motion & { x: number; at: number }) {
  const { surface, accent } = diagramColors.pot;
  const stamp = useAnimatedProps(() => ({ opacity: interpolate(progress.value, [at, at + 0.12], [0, 1], 'clamp') }));
  const check = useAnimatedProps(() => ({ strokeDashoffset: interpolate(progress.value, [at + 0.08, at + 0.24], [40, 0], 'clamp') }));
  return <>
    <Dot cx={x} cy={85} r={34} fill={accent} animatedProps={stamp} />
    <Shape d={`M${x - 12} 84 l8 9 17 -19`} stroke={surface} strokeWidth={4} fill="none"
      strokeLinecap="round" strokeLinejoin="round" strokeDasharray="40 40" animatedProps={check} />
  </>;
}

function Votes({ progress }: Motion) {
  const { ink, accent, surface } = diagramColors.pot;
  return <>
    <Line x1={53} x2={267} y1={85} y2={85} stroke={ink} strokeOpacity={0.44} strokeWidth={2} />
    {[53, 160, 267].map((x, i) => <G key={x}>
      <Circle cx={x} cy={85} r={34} fill={surface} stroke={accent} strokeWidth={2} strokeDasharray={i === 2 ? '3 5' : undefined} />
      <Circle cx={x} cy={85} r={4} fill={accent} fillOpacity={0.5} />
      <Text x={x} y={145} textAnchor="middle" fill={ink} fontSize={15} fontWeight="600">{['You', 'Sam', 'Lee'][i]}</Text>
    </G>)}
    <Vote x={53} at={0.12} progress={progress} /><Vote x={160} at={0.55} progress={progress} />
  </>;
}

function Turns({ progress }: Motion) {
  const { ink, surface, accent } = diagramColors.circle;
  // The pauses leave a moment to read each recipient before the next example round.
  const token = useAnimatedProps(() => {
    const angle = interpolate(progress.value, [0, 0.2, 0.45, 0.58, 0.85, 1],
      [-90, -90, 30, 30, 150, 150], 'clamp') * Math.PI / 180;
    return { cx: 160 + 73 * Math.cos(angle), cy: 97 + 73 * Math.sin(angle) };
  });
  return <>
    <Circle cx={160} cy={97} r={73} fill="none" stroke={accent} strokeOpacity={0.48} strokeWidth={2} strokeDasharray="3 4" />
    <Text x={160} y={96} textAnchor="middle" fill={ink} fontWeight="700" fontSize={18}>The pot</Text>
    <Text x={160} y={114} textAnchor="middle" fill={ink} fontSize={12}>one per round</Text>
    {[[160, 24], [223.2, 133.5], [96.8, 133.5]].map(([cx, cy]) =>
      <Circle key={cx} cx={cx} cy={cy} r={10} fill={surface} stroke={accent} strokeWidth={2} />)}
    <Dot r={13} fill={accent} stroke={surface} strokeWidth={3} animatedProps={token} />
    <G fill={ink} fontSize={14} fontWeight="600">
      <Text x={139} y={24} textAnchor="end">1 · You</Text><Text x={242} y={139}>2 · Sam</Text><Text x={78} y={139} textAnchor="end">3 · Lee</Text>
    </G>
  </>;
}

export function VennPresetDiagram({ kind, progress }: Motion & { kind: VennType }) {
  const Chart = { personal: Refill, shared: Budgets, pot: Votes, circle: Turns }[kind];
  return <Svg width="100%" height="100%" viewBox="0 0 320 186" accessible={false}>
    <Chart progress={progress} />
  </Svg>;
}
