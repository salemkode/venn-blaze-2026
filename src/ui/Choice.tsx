import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors as c } from './theme';
import { styles as s } from './styles';

export interface Option<T> {
  value: T;
  label: string;
  detail?: string;
  weakness?: string;
}

/** A list of options with one selected; each option shows its weakness under it. */
export function Choice<T>({
  title,
  options,
  value,
  onChange,
  testID,
}: {
  title?: string;
  options: Option<T>[];
  value: T;
  onChange(value: T): void;
  testID?: string;
}) {
  return (
    <View style={s.detailCard} testID={testID}>
      {title ? <Text style={s.detailLabel}>{title}</Text> : null}
      {options.map((o, n) => {
        const selected = o.value === value;
        return (
          <View key={String(o.value)}>
            {n || title ? <View style={s.hairline} /> : null}
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={o.label}
              onPress={() => onChange(o.value)}
              style={({ pressed }) => [s.networkOption, pressed ? s.pressed : null]}
            >
              <View style={s.fill}>
                <Text style={s.cardTitle}>{o.label}</Text>
                {o.detail ? <Text style={s.subtitle}>{o.detail}</Text> : null}
                {o.weakness && selected ? <Text style={s.weakness}>{o.weakness}</Text> : null}
              </View>
              <View style={[s.radio, selected ? s.radioSelected : null]}>
                {selected ? <Check size={15} color={c.paper} strokeWidth={3} /> : null}
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/** An on/off option with its explanation. */
export function Toggle({
  label,
  detail,
  value,
  onChange,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [s.networkOption, pressed ? s.pressed : null]}
    >
      <View style={s.fill}>
        <Text style={s.cardTitle}>{label}</Text>
        {detail ? <Text style={s.subtitle}>{detail}</Text> : null}
      </View>
      <View style={[s.radio, value ? s.radioSelected : null]}>
        {value ? <Check size={15} color={c.paper} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}
