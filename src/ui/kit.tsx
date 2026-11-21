import React from 'react';
import { Pressable, Text, TextInput, type TextInputProps, type TextStyle, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors as c } from './theme';
import { styles as s, noteTextStyle, pillButtonStyle, pillButtonTextStyle } from './styles';
import { splitAmount } from './format';

export function PillButton({
  label,
  onPress,
  secondary = false,
  disabled = false,
  testID,
  icon: Icon,
}: {
  label: string;
  onPress?: () => unknown;
  secondary?: boolean;
  disabled?: boolean;
  testID?: string;
  icon?: LucideIcon;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => pillButtonStyle({ secondary, disabled, pressed })}
    >
      {Icon ? <Icon size={20} color={secondary && !disabled ? c.ink : c.paper} /> : null}
      <Text style={pillButtonTextStyle(secondary, disabled)}>{label}</Text>
    </Pressable>
  );
}

/** Small grey pill for a secondary action inside a card. */
export function Chip({
  label,
  onPress,
  disabled = false,
  testID,
  accessibilityLabel,
}: {
  label: string;
  onPress(): unknown;
  disabled?: boolean;
  testID?: string;
  /** Use when several chips on one screen share a visible label. */
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [s.chip, disabled ? s.dimmed : null, pressed ? s.pressed : null]}
    >
      <Text style={s.chipText}>{label}</Text>
    </Pressable>
  );
}

/** A BCH amount whose trailing zeros are drawn fainter than its value. */
export function Amount({
  value,
  style,
  faintStyle,
  testID,
}: {
  value?: string;
  style: TextStyle;
  faintStyle: TextStyle;
  testID?: string;
}) {
  const [strong, faint] = splitAmount(value);
  return (
    <Text testID={testID} numberOfLines={1} adjustsFontSizeToFit style={style}>
      {strong}
      {faint ? <Text style={faintStyle}>{faint}</Text> : null}
    </Text>
  );
}

export function Note({ children, danger = false }: { children?: React.ReactNode; danger?: boolean }) {
  return (
    <View style={s.note}>
      <Text style={noteTextStyle(danger)}>{children}</Text>
    </View>
  );
}

/** Room for the longest share codes (proposals grow with members and coins). */
export const MAX_FIELD_LENGTH = 100_000;

export function Field({
  label,
  hint,
  error,
  ...props
}: TextInputProps & { label: string; hint?: string; error?: string }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={props.accessibilityLabel ?? label}
        accessibilityHint={props.accessibilityHint ?? hint}
        // Android 15+ caps single-line fields at 5,000 characters unless a limit is set, and a
        // proposal in a Venn with three members is already longer. Fields that need a real limit pass one.
        maxLength={MAX_FIELD_LENGTH}
        {...props}
        placeholderTextColor={c.faint}
        style={[s.input, error ? { borderColor: c.danger, borderWidth: 1 } : null]}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={{ color: c.danger, fontSize: 13, lineHeight: 18 }}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** One label/value line in a review card. Use `stacked` for long values such as addresses. */
export function DetailRow({
  label,
  value,
  total = false,
  stacked = false,
  mono = false,
  first = false,
  testID,
}: {
  label: string;
  value: React.ReactNode;
  total?: boolean;
  stacked?: boolean;
  mono?: boolean;
  first?: boolean;
  testID?: string;
}) {
  return (
    <>
      {first ? null : <View style={s.hairline} />}
      <View testID={testID} style={stacked ? s.detailStack : s.detailRow}>
        <Text style={[s.detailLabel, total ? [s.detailTotal, s.inkText] : null]}>{label}</Text>
        <Text
          selectable={stacked}
          style={stacked ? (mono ? s.reviewAddress : [s.detailValue, { textAlign: 'left' }]) : [s.detailValue, total ? s.detailTotal : null]}
        >
          {value}
        </Text>
      </View>
    </>
  );
}

export const QR_MAX_CHARS = 2_900;

/** A QR code that falls back to a message when the value is too long to encode. */
export function SafeQR({ value, size = 176 }: { value: string; size?: number }) {
  // Remember which value failed so a new value gets a fresh attempt without an effect.
  const [failedValue, setFailedValue] = React.useState<string | null>(null);
  // Past about 2,900 characters no QR code can hold it; don't draw a broken one first.
  if (failedValue === value || value.length > QR_MAX_CHARS)
    return (
      <View
        accessibilityRole="text"
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', padding: 12 }}
      >
        <Text style={{ color: c.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
          Too long for a QR code. Use Share and choose Copy or a messaging app.
        </Text>
      </View>
    );
  return (
    <QRCode value={value} size={size} color={c.ink} backgroundColor={c.paper} ecl="L" onError={() => queueMicrotask(() => setFailedValue(value))} />
  );
}
