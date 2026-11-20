// What one person can do, in a page sheet over the Rules step: a focused task with Done,
// instead of a card that unfolds inside the list.
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatAssetAmount, parseCents } from '../../venn/asset';
import { BUDGET, ROLE } from '../../venn/layout';
import { DAY, WEAKNESS, type Plan } from '../../venn/presets';
import { colors as c } from '../../ui/theme';
import { AmountRow, Group, type Report, SegmentRow, StepperRow, SwitchRow, Weakness } from './form';

type Member = Plan['members'][number];

const ROLE_ROWS = [
  { role: ROLE.SPEND, label: 'Spends alone' },
  { role: ROLE.VOTE, label: 'Votes' },
  { role: ROLE.REQUIRED, label: 'Must sign every vote' },
  { role: ROLE.HELPER, label: 'Helps recover lost keys' },
];
const BUDGETS = [
  {
    value: BUDGET.REFILL,
    short: 'Refilling',
    meaning: 'Spent money comes back bit by bit over the period.',
    weakness: WEAKNESS.budget[BUDGET.REFILL],
  },
  {
    value: BUDGET.FIXED,
    short: 'Fixed periods',
    meaning: 'The budget is added again at the start of each period.',
    weakness: WEAKNESS.budget[BUDGET.FIXED],
  },
];

const days = (seconds: bigint) => Math.max(1, Math.round(Number(seconds) / Number(DAY)));

export function PersonSheet({
  member,
  n,
  you,
  locked,
  report,
  onChange,
  onClose,
  unit,
}: {
  member: Member;
  n: number;
  you: boolean;
  /** A field is invalid: closing would hide it. */
  locked: boolean;
  report: Report;
  onChange(change: Partial<Member>): void;
  onClose(): void;
  /** The Venn's asset on this network: Venn Test USD or MUSD. */
  unit: string;
}) {
  const spends = (member.roles & ROLE.SPEND) === ROLE.SPEND;
  const setRole = (role: number, on: boolean) => {
    const roles = on ? member.roles | role : member.roles & ~role;
    const spendsNow = (roles & ROLE.SPEND) === ROLE.SPEND;
    onChange({
      roles: on && role === ROLE.REQUIRED ? roles | ROLE.VOTE : roles,
      ...(spendsNow && member.budgetMode === BUDGET.NONE
        ? { budgetMode: BUDGET.REFILL, budget: 100_000n, period: DAY }
        : {}),
      ...(!spendsNow ? { budgetMode: BUDGET.NONE, budget: 0n, period: 0n, cap: 0n } : {}),
    });
  };
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal={!locked}
      onRequestClose={() => {
        if (!locked) onClose();
      }}
    >
      <SafeAreaView style={p.root} edges={['bottom', 'left', 'right']} testID={`venn-person-sheet-${n}`}>
        <View style={p.bar}>
          <View style={p.side} />
          <Text accessibilityRole="header" numberOfLines={1} style={p.title}>
            {you ? `${member.name} (you)` : member.name}
          </Text>
          <View style={[p.side, p.right]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: locked }}
              accessibilityHint={locked ? 'Fix the field marked in red first.' : undefined}
              disabled={locked}
              onPress={onClose}
              hitSlop={12}
              testID="venn-person-done"
              style={({ pressed }) => [p.done, locked ? p.dim : null, pressed ? p.dim : null]}
            >
              <Text style={p.doneText}>Done</Text>
            </Pressable>
          </View>
        </View>
        {/* In a sheet, KeyboardAvoidingView measures from the sheet, not the screen: let the
            scroll view inset itself for the keyboard and keep the focused field in view. */}
        <ScrollView
          style={p.fill}
          contentContainerStyle={p.content}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Group title="What they can do">
            {ROLE_ROWS.map(r => (
              <SwitchRow
                key={r.role}
                label={r.label}
                detail={WEAKNESS.roles[r.role]}
                value={(member.roles & r.role) === r.role}
                onChange={on => setRole(r.role, on)}
                testID={`venn-role-${r.role}`}
              />
            ))}
          </Group>
          {spends ? (
            <Group
              title="Budget"
              footer={
                <View style={p.notes}>
                  <Text style={p.note}>Amounts are in {unit}.</Text>
                  {member.cap ? <Weakness>{WEAKNESS.cap}</Weakness> : null}
                </View>
              }
            >
              <SegmentRow
                options={BUDGETS}
                value={member.budgetMode}
                onChange={budgetMode => onChange({ budgetMode })}
                testID="venn-budget-mode"
              />
              <AmountRow
                id={`budget-${n}`}
                report={report}
                label={member.budgetMode === BUDGET.FIXED ? 'Each period' : 'Budget'}
                value={member.budget}
                format={formatAssetAmount}
                parse={(text: string) => parseCents(text)}
                onChange={budget => onChange({ budget })}
                testID="venn-budget"
              />
              <StepperRow
                id={`period-${n}`}
                report={report}
                label={member.budgetMode === BUDGET.FIXED ? 'Period lasts' : 'Refills over'}
                unit={['day', 'days']}
                min={1}
                value={days(member.period)}
                onChange={d => onChange({ period: BigInt(d) * DAY })}
                testID="venn-period"
              />
              <AmountRow
                id={`cap-${n}`}
                report={report}
                label="Largest payment"
                detail="Leave empty for no limit."
                noLimit
                value={member.cap}
                format={formatAssetAmount}
                parse={(text: string) => parseCents(text)}
                onChange={cap => onChange({ cap })}
                testID="venn-cap"
              />
            </Group>
          ) : (
            <Weakness style={p.alone}>{WEAKNESS.budget[BUDGET.NONE]}</Weakness>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const p = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  fill: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16 },
  side: { width: 72 },
  right: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', color: c.ink, fontSize: 17, fontWeight: '600' },
  done: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  doneText: { color: c.ink, fontSize: 17, fontWeight: '700' },
  dim: { opacity: 0.4 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  notes: { marginTop: 8, paddingHorizontal: 16, gap: 6 },
  note: { color: c.muted, fontSize: 13, lineHeight: 18 },
  alone: { marginTop: 16, paddingHorizontal: 16 },
});
