import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { formatBch } from 'react-native-xo';
import { colors as c } from '../ui/theme';
import { styles as s } from '../ui/styles';
import { Chip, DetailRow, PillButton } from '../ui/kit';
import { type HistoryItem, dayLabel } from '../wallet/history';

/** "+0.00100000", "−0.00030226" or "—" when the amount is not known. */
export function signedAmount(delta?: string) {
  if (delta === undefined) return '—';
  const value = BigInt(delta);
  if (value === 0n) return formatBch(0n);
  return `${value > 0n ? '+' : '−'}${formatBch(value > 0n ? value : -value)}`;
}

export function activityTitle(item: HistoryItem) {
  if (item.delta === undefined) return 'Transaction';
  return BigInt(item.delta) < 0n ? 'Sent' : 'Received';
}

function clock(time: number) {
  return new Date(time * 1000).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The newest transactions, grouped by day. */
export function ActivityList({ history, unit, open }) {
  const { status, items, reload } = history;
  if (!items.length)
    return status === 'error' ? (
      <View testID="activity-error" style={s.activityRow}>
        <View style={s.fill}>
          <Text style={s.cardTitle}>Activity</Text>
          <Text style={s.subtitle}>Couldn’t load your recent transactions</Text>
        </View>
        <Chip label="Retry" testID="activity-retry" onPress={reload} />
      </View>
    ) : status === 'ready' ? (
      <View testID="activity-empty">
        <Text accessibilityRole="header" style={s.sectionTitle}>
          Activity
        </Text>
        <Text style={s.subtitle}>No transactions yet. {unit} you send or receive will appear here.</Text>
      </View>
    ) : null;
  return (
    <View testID="activity">
      <View style={s.sectionHeading}>
        <Text accessibilityRole="header" style={s.sectionTitle}>
          Activity
        </Text>
      </View>
      {items.map((item, index) => {
        const label = dayLabel(item.time);
        const heading = index > 0 && dayLabel(items[index - 1].time) === label ? null : label;
        const sent = item.delta !== undefined && BigInt(item.delta) < 0n;
        const Icon = sent ? ArrowUpRight : ArrowDownLeft;
        return (
          <View key={item.txid}>
            {heading ? <Text style={s.dayLabel}>{heading}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${activityTitle(item)}, ${signedAmount(item.delta)} ${unit}, ${item.time ? `${label} ${clock(item.time)}` : 'pending'}`}
              accessibilityHint="Opens transaction details."
              testID={`activity-${item.txid}`}
              onPress={() => open('transaction', { txid: item.txid })}
              style={({ pressed }) => [s.activityRow, pressed ? s.pressed : null]}
            >
              <View style={s.activityMark}>
                <Icon size={20} color={sent ? c.ink : c.green} />
              </View>
              <View style={s.fill}>
                <Text style={s.cardTitle}>{activityTitle(item)}</Text>
                <Text style={s.subtitle}>{item.time ? clock(item.time) : 'Pending'}</Text>
              </View>
              <Text style={s.activityAmount}>
                {signedAmount(item.delta)} {unit}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/** One transaction: amount, status, time and its ID. */
export function TransactionDetail({ item, unit, network, explorer }) {
  const title = activityTitle(item);
  const amount = signedAmount(item.delta);
  return (
    <View testID="transaction-screen">
      <View accessible accessibilityLabel={`${title}, ${amount} ${unit}`} style={s.reviewHero}>
        <Text accessibilityRole="header" style={s.amountUnit}>
          {title}
        </Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={s.reviewAmount}>
          {amount}
        </Text>
        <Text style={s.amountUnit}>{unit}</Text>
      </View>
      <View style={[s.detailCard, s.cardGap]}>
        <DetailRow first label="Status" value={item.pending ? 'Pending' : 'Confirmed'} />
        {item.time ? (
          <DetailRow
            label="Date"
            value={new Date(item.time * 1000).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          />
        ) : null}
        <DetailRow label="Network" value={network} />
        <DetailRow label="Amount" value={item.delta === undefined ? 'Unknown' : `${amount} ${unit}`} />
        <View style={s.hairline} />
        <View style={s.detailStack}>
          <Text style={s.detailLabel}>Transaction ID</Text>
          <Text testID="transaction-id" selectable style={s.categoryId}>
            {item.txid}
          </Text>
        </View>
      </View>
      <PillButton
        label="View on explorer"
        testID="view-transaction"
        secondary
        onPress={() => Linking.openURL(`${explorer}${item.txid}`)}
      />
    </View>
  );
}
