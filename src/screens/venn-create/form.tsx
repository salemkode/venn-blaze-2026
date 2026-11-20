// The Create a Venn form, drawn as an iOS grouped list: grey page, one level of white groups,
// rows split by inset hairlines. Nothing nests inside a second card. Choices of two or three
// use a segmented control, whole numbers a stepper, on/off a native switch.
import React, { Children, Fragment, useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  type TextInputInstance,
  type TextInputProps,
  View,
} from 'react-native';
import { ChevronRight, Minus, Plus, TriangleAlert } from 'lucide-react-native';
import { colors as c } from '../../ui/theme';

/** Reports a field's error to the step, so the step can hold its primary action. */
export type Report = (id: string, invalid: boolean) => void;

export function useReportedError(id: string, report: Report) {
  const [error, setError] = useState('');
  useEffect(() => {
    report(id, Boolean(error));
  }, [id, error, report]);
  useEffect(() => () => report(id, false), [id, report]);
  return [error, setError] as const;
}

/** A titled white group of rows, with an optional note under it. */
export function Group({
  title,
  action,
  footer,
  children,
  testID,
}: {
  title?: string;
  /** A small control on the title line, such as Edit. */
  action?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  testID?: string;
}) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={f.group} testID={testID}>
      {title || action ? (
        <View style={f.groupHead}>
          {title ? (
            <Text accessibilityRole="header" style={f.groupTitle}>
              {title}
            </Text>
          ) : null}
          {action}
        </View>
      ) : null}
      <View style={f.surface}>
        {/* Keyed by each row's own key, so adding a row above a field never remounts it. */}
        {rows.map((row, n) => (
          <Fragment key={React.isValidElement(row) && row.key != null ? row.key : n}>
            {n ? <View style={f.divider} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {typeof footer === 'string' ? <Text style={f.footer}>{footer}</Text> : footer}
    </View>
  );
}

/** A text button for a group's title line. */
export function GroupAction({ label, onPress, testID }: { label: string; onPress(): void; testID?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={12}
      testID={testID}
      style={({ pressed }) => [f.groupAction, pressed ? f.pressedText : null]}
    >
      <Text style={f.groupActionText}>{label}</Text>
    </Pressable>
  );
}

/** A weakness, marked by an icon as well as colour. */
export function Weakness({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[f.weakness, style]} accessible accessibilityLabel={`Weakness: ${String(children)}`}>
      <TriangleAlert size={14} color={c.warningInk} strokeWidth={2.2} style={f.weaknessIcon} />
      <Text style={f.weaknessText}>{children}</Text>
    </View>
  );
}

/** A row's label and hint. An error takes the hint's place, so it shows wherever the field does. */
function Label({ label, detail, error }: { label: string; detail?: string; error?: string }) {
  return (
    <View style={f.labelBox}>
      <Text style={f.label}>{label}</Text>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[f.detail, f.errorText]}>
          {error}
        </Text>
      ) : detail ? (
        <Text style={f.detail}>{detail}</Text>
      ) : null}
    </View>
  );
}

/** A row that opens something: label and summary on the left, a chevron on the right. */
export function LinkRow({
  label,
  lines,
  onPress,
  testID,
  accessibilityHint,
}: {
  label: string;
  lines: string[];
  onPress(): void;
  testID?: string;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, ...lines].join('. ')}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [f.row, pressed ? f.pressedRow : null]}
    >
      <View style={f.labelBox}>
        <Text style={f.label}>{label}</Text>
        {lines.map(line => (
          <Text key={line} style={f.detail}>
            {line}
          </Text>
        ))}
      </View>
      <ChevronRight size={18} color={c.faint} strokeWidth={2.2} />
    </Pressable>
  );
}

/** A plain row: a label with something on the right. */
export function Row({ label, detail, children }: { label: string; detail?: string; children?: React.ReactNode }) {
  return (
    <View style={f.row}>
      <Label label={label} detail={detail} />
      {children}
    </View>
  );
}

/** On or off. The whole row is the target; the switch is the platform's own. */
export function SwitchRow({
  label,
  detail,
  value,
  onChange,
  testID,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange(on: boolean): void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      testID={testID}
      style={({ pressed }) => [f.row, pressed ? f.pressedRow : null]}
    >
      <Label label={label} detail={detail} />
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: c.ink, false: c.disabled }}
        ios_backgroundColor={c.disabled}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

export interface Segment<T> {
  value: T;
  /** One or two words: it has to fit a third of the row. */
  short: string;
  /** What choosing it means, shown once chosen. */
  meaning?: string;
  weakness?: string;
}

/** Two or three choices side by side. The chosen one's meaning and weakness show under it. */
export function SegmentRow<T>({
  label,
  options,
  value,
  onChange,
  testID,
}: {
  label?: string;
  options: readonly Segment<T>[];
  value: T;
  onChange(value: T): void;
  testID?: string;
}) {
  const chosen = options.find(o => o.value === value);
  return (
    <View style={f.stackRow} testID={testID}>
      {label ? <Text style={f.label}>{label}</Text> : null}
      <View style={f.segments} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map(o => {
          const on = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              accessibilityRole="radio"
              accessibilityLabel={o.short}
              accessibilityHint={o.weakness ? `Weakness: ${o.weakness}` : undefined}
              accessibilityState={{ checked: on }}
              onPress={() => onChange(o.value)}
              testID={testID ? `${testID}-${String(o.value)}` : undefined}
              style={({ pressed }) => [f.segment, on ? f.segmentOn : null, pressed && !on ? f.pressedText : null]}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit style={[f.segmentText, on ? f.segmentTextOn : null]}>
                {o.short}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {chosen?.meaning ? <Text style={f.detail}>{chosen.meaning}</Text> : null}
      {chosen?.weakness ? <Weakness>{chosen.weakness}</Weakness> : null}
    </View>
  );
}

function StepButton({
  plus,
  label,
  disabled,
  onPress,
}: {
  plus?: boolean;
  label: string;
  disabled: boolean;
  onPress(): void;
}) {
  const Icon = plus ? Plus : Minus;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [f.stepButton, pressed ? f.stepPressed : null]}
    >
      <Icon size={17} color={disabled ? c.faint : c.ink} strokeWidth={2.4} />
    </Pressable>
  );
}

/** A whole number with − and + either side of it. The number itself can be typed. */
export function StepperRow({
  id,
  report,
  label,
  detail,
  unit,
  value,
  min = 0,
  max,
  onChange,
  testID,
}: {
  id: string;
  report: Report;
  label: string;
  detail?: string;
  /** Singular and plural, e.g. ['day', 'days']. */
  unit: readonly [string, string];
  value: number;
  min?: number;
  max?: number;
  onChange(v: number): void;
  testID?: string;
}) {
  const [text, setText] = useState(String(value));
  const [error, setError] = useReportedError(id, report);
  const top = max ?? 999;
  const typed = Number(text);
  const current = text.trim() && Number.isInteger(typed) ? typed : value;
  const step = (by: number) => {
    const n = Math.min(top, Math.max(min, current + by));
    setText(String(n));
    setError('');
    onChange(n);
  };
  return (
    <View style={f.row}>
      <Label label={label} detail={detail} error={error} />
      <View style={[f.stepper, error ? f.invalid : null]}>
        <StepButton label={`Fewer: ${label}`} disabled={current <= min} onPress={() => step(-1)} />
        <View style={f.stepValue}>
          <TextInput
            value={text}
            accessibilityLabel={`${label}, ${unit[current === 1 ? 0 : 1]}`}
            keyboardType="number-pad"
            selectTextOnFocus
            maxLength={3}
            testID={testID}
            onChangeText={t => {
              setText(t);
              const n = Number(t);
              if (t.trim() && Number.isInteger(n) && n >= min && n <= top) {
                setError('');
                onChange(n);
              } else if (n > top) setError(`At most ${top}.`);
              else setError(`A whole number, at least ${min}.`);
            }}
            style={f.stepInput}
          />
          <Text style={f.stepUnit}>{unit[current === 1 ? 0 : 1]}</Text>
        </View>
        <StepButton plus label={`More: ${label}`} disabled={current >= top} onPress={() => step(1)} />
      </View>
    </View>
  );
}

/** A money amount typed on the right of its row. Empty can mean "No limit". */
export function AmountRow({
  id,
  report,
  label,
  detail,
  value,
  format,
  parse,
  noLimit = false,
  onChange,
  testID,
}: {
  id: string;
  report: Report;
  label: string;
  detail?: string;
  value: bigint;
  format(v: bigint): string;
  parse(text: string): bigint;
  noLimit?: boolean;
  onChange(v: bigint): void;
  testID?: string;
}) {
  const [text, setText] = useState(noLimit && value === 0n ? '' : format(value));
  const [error, setError] = useReportedError(id, report);
  const [focused, setFocused] = useState(false);
  return (
    <View style={f.row}>
      <Label label={label} detail={detail} error={error} />
      <TextInput
        value={text}
        accessibilityLabel={label}
        accessibilityHint={detail}
        keyboardType="decimal-pad"
        selectTextOnFocus
        placeholder={noLimit ? 'No limit' : '0.00'}
        placeholderTextColor={c.faint}
        testID={testID}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChangeText={t => {
          setText(t);
          try {
            onChange(parse(t || '0'));
            setError('');
          } catch (e) {
            setError((e as Error).message);
          }
        }}
        style={[f.amount, focused ? f.amountFocused : null, error ? f.invalid : null]}
      />
    </View>
  );
}

/** A fact in a summary: label left and value right, or the value under the label when long. */
export function InfoRow({
  label,
  value,
  stacked = false,
  testID,
}: {
  label: string;
  value: string;
  stacked?: boolean;
  testID?: string;
}) {
  return stacked ? (
    <View style={f.stackRow} testID={testID}>
      <Text style={f.detailLabel}>{label}</Text>
      <Text selectable style={f.label}>
        {value}
      </Text>
    </View>
  ) : (
    <View style={f.row} testID={testID}>
      <Text style={[f.label, f.labelBox]}>{label}</Text>
      <Text style={f.value}>{value}</Text>
    </View>
  );
}

function RowError({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityLiveRegion="polite" style={f.error}>
      {children}
    </Text>
  );
}

/** A text field that is a whole row: the label above, the text under it. */
export function TextRow({
  label,
  error,
  trailing,
  ref,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & {
  label: string;
  error?: string;
  trailing?: React.ReactNode;
  ref?: React.Ref<TextInputInstance>;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={f.rowWrap}>
      <View style={f.textRow}>
        <View style={f.labelBox}>
          <Text style={[f.textLabel, focused ? f.textLabelFocused : null, error ? f.errorText : null]}>{label}</Text>
          <TextInput
            ref={ref}
            accessibilityLabel={props.accessibilityLabel ?? label}
            placeholderTextColor={c.faint}
            {...props}
            onFocus={e => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={e => {
              setFocused(false);
              onBlur?.(e);
            }}
            style={f.textInput}
          />
        </View>
        {trailing}
      </View>
      {error ? <RowError>{error}</RowError> : null}
    </View>
  );
}

const f = StyleSheet.create({
  group: { marginTop: 24 },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    minHeight: 28,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  groupTitle: { flex: 1, color: c.muted, fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0.2 },
  groupAction: { minHeight: 28, justifyContent: 'flex-end' },
  groupActionText: { color: c.ink, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  surface: { backgroundColor: c.paper, borderRadius: 16, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: 16 },
  footer: { color: c.muted, fontSize: 13, lineHeight: 18, marginTop: 8, paddingHorizontal: 16 },
  row: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowWrap: {},
  stackRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  labelBox: { flex: 1, minWidth: 0 },
  label: { color: c.ink, fontSize: 16, lineHeight: 22, fontWeight: '500' },
  detail: { color: c.muted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  detailLabel: { color: c.muted, fontSize: 13, lineHeight: 18, fontWeight: '600', marginBottom: -6 },
  value: { color: c.muted, fontSize: 16, lineHeight: 22, flexShrink: 1, textAlign: 'right', maxWidth: '60%' },
  pressedRow: { backgroundColor: c.tile },
  pressedText: { opacity: 0.55 },
  weakness: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  weaknessIcon: { marginTop: 2 },
  weaknessText: { flex: 1, color: c.warningInk, fontSize: 13, lineHeight: 18 },
  segments: { flexDirection: 'row', backgroundColor: c.tile, borderRadius: 11, padding: 3, gap: 3, minHeight: 44 },
  segment: { flex: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentOn: {
    backgroundColor: c.paper,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: { color: c.muted, fontSize: 14, fontWeight: '600' },
  segmentTextOn: { color: c.ink },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.tile,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  stepButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  stepPressed: { backgroundColor: c.border, borderRadius: 10 },
  stepValue: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', minWidth: 64, gap: 3 },
  stepInput: {
    color: c.ink,
    fontSize: 17,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    padding: 0,
    textAlign: 'right',
    minWidth: 14,
  },
  stepUnit: { color: c.muted, fontSize: 14, fontWeight: '500' },
  amount: {
    minWidth: 112,
    maxWidth: 160,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: c.tile,
    borderWidth: 1.5,
    borderColor: 'transparent',
    color: c.ink,
    fontSize: 17,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  amountFocused: { borderColor: c.ink, backgroundColor: c.paper },
  invalid: { borderColor: c.danger },
  error: { color: c.danger, fontSize: 13, lineHeight: 18, paddingHorizontal: 16, paddingBottom: 12, marginTop: -4 },
  errorText: { color: c.danger },
  textRow: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  textLabel: { color: c.muted, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  textLabelFocused: { color: c.ink },
  textInput: { color: c.ink, fontSize: 17, lineHeight: 22, paddingVertical: 4, paddingHorizontal: 0, minHeight: 30 },
});
