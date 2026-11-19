import { Children, Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { colors as c } from './theme';

export const settingsStyle = {
  title: { fontSize: 28, lineHeight: 36, fontWeight: '700', letterSpacing: -0.7, color: c.ink, marginBottom: 24 },
  group: { marginBottom: 24 },
  groupLabel: { fontSize: 12, lineHeight: 18, fontWeight: '500', color: c.muted, marginBottom: 8, marginLeft: 16 },
  surface: { backgroundColor: c.paper, borderRadius: 16, overflow: 'hidden' },
  row: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { color: c.ink, fontSize: 16, lineHeight: 22, fontWeight: '500' },
  detail: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  content: { flex: 1, minWidth: 0 },
  value: { color: c.muted, fontSize: 14, lineHeight: 20, maxWidth: '40%' },
  divider: { height: 1, backgroundColor: c.background, marginLeft: 48 },
  pressed: { backgroundColor: c.tile },
  disabled: { opacity: 0.45 },
  footer: { alignItems: 'center', paddingTop: 2, paddingBottom: 24, gap: 4 },
  footerText: { color: c.muted, fontSize: 12, lineHeight: 18 },
  introduction: { color: c.muted, fontSize: 15, lineHeight: 23, marginBottom: 24 },
  danger: { color: c.danger },
} as const;

export function SettingsGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <View style={settingsStyle.group}>
      {title ? <Text accessibilityRole="header" style={settingsStyle.groupLabel}>{title}</Text> : null}
      <View style={settingsStyle.surface}>
        {rows.map((child, index) => <Fragment key={index}>{index > 0 ? <View style={settingsStyle.divider} /> : null}{child}</Fragment>)}
      </View>
    </View>
  );
}

export function SettingsRow({
  label, value, detail, icon: Icon, accessory, onPress, disabled = false, danger = false, checked, testID,
}: {
  label: string;
  value?: string;
  detail?: string;
  icon?: LucideIcon;
  accessory?: React.ReactNode;
  onPress?: () => unknown;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  testID?: string;
}) {
  const content = <>
    {Icon ? <Icon size={19} color={danger ? c.danger : c.ink} strokeWidth={1.7} /> : null}
    <View style={settingsStyle.content}>
      <Text style={[settingsStyle.label, danger ? settingsStyle.danger : null]}>{label}</Text>
      {detail ? <Text style={settingsStyle.detail}>{detail}</Text> : null}
    </View>
    {value ? <Text numberOfLines={1} style={settingsStyle.value}>{value}</Text> : null}
    {accessory ?? (onPress ? <ChevronRight size={16} color={c.faint} strokeWidth={1.7} /> : null)}
  </>;
  return onPress ? (
    <Pressable
      testID={testID}
      accessibilityRole={checked === undefined ? 'button' : 'radio'}
      accessibilityLabel={[label, value, detail].filter(Boolean).join(', ')}
      accessibilityState={{ disabled, ...(checked === undefined ? {} : { checked }) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [settingsStyle.row, pressed ? settingsStyle.pressed : null, disabled ? settingsStyle.disabled : null]}
    >{content}</Pressable>
  ) : <View style={settingsStyle.row} testID={testID}>{content}</View>;
}
