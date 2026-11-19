// Create a Venn: pick a type, name the people, change anything, read the summary, then
// share the invitation. Nothing reaches the chain until everyone has accepted.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePreventRemove } from 'expo-router';
import { ArrowDown, X } from 'lucide-react-native';
import { formatTestUsd, parseTestUsd, VENN_TEST_USD } from '../venn/asset';
import { colors as c } from '../ui/theme';
import { styles as s } from '../ui/styles';
import { Chip, DetailRow, Field, Note, PillButton } from '../ui/kit';
import { useKeyboardOffset } from '../ui/Page';
import { Choice, type Option, Toggle } from '../ui/Choice';
import { BUDGET, ROLE, RULE, STOP } from '../venn/layout';
import {
  type Plan,
  type VennType,
  DAY,
  RECOVERY_OFF,
  TYPES,
  WEAKNESS,
  daysToUnits,
  presetPlan,
  checkPlan,
  unitsToDays,
} from '../venn/presets';
import { summarize } from '../venn/summary';
import { inviteFor, type Invite } from '../venn/invite';
import type { Network } from '../wallet/prefs';

/** The contracts hold at most 16 voters (Venn) or members (Circle), including the creator. */
const MAX_SEATS = 16;
const MAX_NAME = 40;

const ROLE_OPTIONS = [
  { role: ROLE.SPEND, label: 'Spends alone' },
  { role: ROLE.VOTE, label: 'Votes' },
  { role: ROLE.REQUIRED, label: 'Must sign every vote' },
  { role: ROLE.HELPER, label: 'Helps recover lost keys' },
];
const RULES = [
  { value: RULE.LOCKED, label: 'Locked', weakness: WEAKNESS.rule[RULE.LOCKED] },
  { value: RULE.MAJORITY, label: 'Majority', weakness: WEAKNESS.rule[RULE.MAJORITY] },
  { value: RULE.EVERYONE, label: 'Everyone', weakness: WEAKNESS.rule[RULE.EVERYONE] },
];
const BUDGETS = [
  { value: BUDGET.REFILL, label: 'Refilling', weakness: WEAKNESS.budget[BUDGET.REFILL] },
  { value: BUDGET.FIXED, label: 'Fixed periods', weakness: WEAKNESS.budget[BUDGET.FIXED] },
];
const STOPS = [
  { value: STOP.KEY, label: 'The seat’s current key', weakness: WEAKNESS.stop[STOP.KEY] },
  { value: STOP.VOTERS, label: 'A majority of voters', weakness: WEAKNESS.stop[STOP.VOTERS] },
  { value: STOP.BOTH, label: 'Both: a normal and a stronger path', weakness: WEAKNESS.stop[STOP.BOTH] },
];
const CATEGORIES = [
  ['membership', 'Adding or removing members'],
  ['spending', 'Changing budgets'],
  ['recoveryRule', 'Changing recovery'],
  ['governance', 'Changing these rules'],
] as const;

type Step = 'people' | 'rules' | 'review';
const STEPS: Record<Step, { n: number; title: string }> = {
  people: { n: 2, title: 'People' },
  rules: { n: 3, title: 'Rules' },
  review: { n: 4, title: 'Review' },
};
const previousStep = (step: Step): Step => (step === 'review' ? 'rules' : 'people');

interface Draft {
  vennName: string;
  you: string;
  people: string[];
  plan: Plan | null;
}
/** Unsaved drafts for this app session, per wallet key and type. Cleared once a plan is saved. */
const drafts = new Map<string, Draft>();

/** Every option shows its weakness: unselected options as a detail line, the selected one highlighted. */
const withWeakness = <T,>(options: Option<T>[], value: T): Option<T>[] =>
  options.map(o => (o.value === value ? o : { ...o, detail: o.weakness }));

const sameRecovery = (a: Plan['settings'], b: Plan['settings']) =>
  a.recoveryOn === b.recoveryOn &&
  a.helpersNeeded === b.helpersNeeded &&
  a.waitUnits === b.waitUnits &&
  a.stopRule === b.stopRule &&
  a.strongNeeded === b.strongNeeded &&
  a.strongWaitUnits === b.strongWaitUnits;

/**
 * The plan for these people. Changes already made on the Rules step are kept for everyone
 * still in the group. When people join or leave, the recovery settings start again from the
 * preset, because helper counts depend on the group.
 */
function planFor(type: VennType, myKey: string, draft: Draft): { plan: Plan; recoveryReset: boolean } {
  const fresh = presetPlan(
    type,
    { name: draft.you.trim() || 'You', publicKey: myKey },
    draft.people.map(name => ({ name, publicKey: '' })),
    5_000n,
  );
  const name = draft.vennName.trim() || `${TYPES[type].title} Venn`;
  const previous = draft.plan;
  if (!previous) return { plan: { ...fresh, name }, recoveryReset: false };

  const unused = previous.members.map((m, seat) => ({ m, seat })).slice(1);
  const oldSeat: number[] = [];
  const members = fresh.members.map((m, n) => {
    if (n === 0) {
      oldSeat.push(0);
      return { ...previous.members[0], name: m.name, publicKey: m.publicKey };
    }
    const k = unused.findIndex(u => u.m.name === m.name);
    if (k < 0) {
      oldSeat.push(-1);
      return m;
    }
    const [{ m: old, seat }] = unused.splice(k, 1);
    oldSeat.push(seat);
    return { ...old, name: m.name };
  });
  const sameGroup = members.length === previous.members.length && oldSeat.every(seat => seat >= 0);
  const { membership, spending, recoveryRule, governance, payments } = previous.settings;
  const settings = sameGroup
    ? previous.settings
    : { ...fresh.settings, membership, spending, recoveryRule, governance, payments };
  let turns = fresh.turns;
  if (fresh.turns && previous.turns) {
    const kept = previous.turns.map(old => oldSeat.indexOf(old)).filter(seat => seat >= 0);
    turns = [...kept, ...fresh.turns.filter(seat => !kept.includes(seat))];
  }
  return {
    plan: { ...fresh, name, members, settings, ...(turns ? { turns } : {}), ...(previous.circle ? { circle: previous.circle } : {}) },
    recoveryReset: !sameGroup && !sameRecovery(settings, previous.settings),
  };
}

/** Reports a field's error to the step, so the step can hold its primary action. */
type Report = (id: string, invalid: boolean) => void;

function useReportedError(id: string, report: Report) {
  const [error, setError] = useState('');
  useEffect(() => {
    report(id, Boolean(error));
  }, [id, error, report]);
  useEffect(() => () => report(id, false), [id, report]);
  return [error, setError] as const;
}

/** A number typed as text, committed when it parses. */
function Amount({
  id,
  report,
  label,
  value,
  onChange,
  days = false,
}: {
  id: string;
  report: Report;
  label: string;
  value: bigint | number;
  onChange(v: bigint): void;
  days?: boolean;
}) {
  const shown = days ? String(Number(value) / 86_400) : formatTestUsd(BigInt(value));
  const [text, setText] = useState(shown);
  const [error, setError] = useReportedError(id, report);
  return (
    <Field
      label={label}
      value={text}
      error={error}
      keyboardType="decimal-pad"
      onChangeText={(t: string) => {
        setText(t);
        if (days) {
          const d = Number(t);
          if (t.trim() && Number.isFinite(d) && d > 0) {
            setError('');
            onChange(BigInt(Math.round(d * 86_400)));
          } else setError('Enter a number of days above 0.');
          return;
        }
        try {
          onChange(parseTestUsd(t || '0'));
          setError('');
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    />
  );
}

function Count({
  id,
  report,
  label,
  value,
  min = 0,
  onChange,
}: {
  id: string;
  report: Report;
  label: string;
  value: number;
  min?: number;
  onChange(v: number): void;
}) {
  const [text, setText] = useState(String(value));
  const [error, setError] = useReportedError(id, report);
  return (
    <Field
      label={label}
      value={text}
      error={error}
      keyboardType="number-pad"
      onChangeText={(t: string) => {
        setText(t);
        const n = Number(t);
        if (t.trim() && Number.isInteger(n) && n >= min) {
          setError('');
          onChange(n);
        } else setError(min ? `Enter a whole number, at least ${min}.` : 'Enter a whole number.');
      }}
    />
  );
}

function Section({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={local.section}>
      <Text style={[s.sectionTitle, s.fill]}>{title}</Text>
      {action}
    </View>
  );
}

export default function CreateVenn({
  type,
  network,
  myKey,
  onSave,
  onDone,
}: {
  type: VennType;
  network: Network;
  myKey: string;
  /** Stores the plan. Throws if it could not be saved. */
  onSave(invite: Invite): Promise<unknown>;
  /** Leaves the wizard once the plan is saved. */
  onDone(invite: Invite): void;
}) {
  const draftKey = `${myKey}:${type}`;
  const [restored] = useState(() => drafts.get(draftKey));
  const [step, setStep] = useState<Step>('people');
  const [vennName, setVennName] = useState(restored?.vennName ?? '');
  const [you, setYou] = useState(restored?.you ?? '');
  const [people, setPeople] = useState<string[]>(restored?.people ?? []);
  const [plan, setPlan] = useState<Plan | null>(restored?.plan ?? null);
  const [newPerson, setNewPerson] = useState('');
  const [personError, setPersonError] = useState('');
  const [youError, setYouError] = useState('');
  const [recoveryReset, setRecoveryReset] = useState(false);
  const [showRestored, setShowRestored] = useState(Boolean(restored));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
  const scroll = useRef<ScrollViewInstance>(null);
  const keyboardOffset = useKeyboardOffset();
  /** True while the add-person field is focused, so the view follows it as the keyboard opens. */
  const followEnd = useRef(false);
  const report = useCallback<Report>(
    (id, bad) =>
      setInvalid(current => {
        if (current.has(id) === bad) return current;
        const next = new Set(current);
        if (bad) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );
  const title = TYPES[type].title;

  // Keep the draft for this session so leaving and reopening this type restores it.
  useEffect(() => {
    if (leaving) return;
    if (vennName || you || people.length || plan) drafts.set(draftKey, { vennName, you, people, plan });
    else drafts.delete(draftKey);
  }, [draftKey, leaving, vennName, you, people, plan]);

  // Each step starts at its heading. The add-person field unmounts without a blur, so stop
  // following the end here or the keyboard closing would scroll the new step to its bottom.
  useEffect(() => {
    followEnd.current = false;
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  // The header Back button and the swipe-back gesture go back one step inside the wizard.
  const disablePrevention = usePreventRemove(step !== 'people' && !leaving, () => setStep(previousStep));

  const problem = useMemo(() => {
    if (!plan) return '';
    try {
      checkPlan(plan);
      return '';
    } catch (e) {
      return (e as Error).message;
    }
  }, [plan]);

  const member = (n: number, change: Partial<Plan['members'][number]>) =>
    setPlan(p => p && { ...p, members: p.members.map((m, i) => (i === n ? { ...m, ...change } : m)) });
  const settings = (change: Partial<Plan['settings']>) =>
    setPlan(p => p && { ...p, settings: { ...p.settings, ...change } });

  const seatsLeft = MAX_SEATS - 1 - people.length;
  const youName = you.trim() || 'You';
  const taken = (name: string) =>
    [youName, ...people].some(other => other.toLocaleLowerCase() === name.toLocaleLowerCase());

  const addPerson = () => {
    const name = newPerson.trim();
    if (!name) return setPersonError('Type a name first.');
    if (seatsLeft <= 0) return setPersonError(`A Venn holds at most ${MAX_SEATS} people, including you.`);
    if (taken(name)) return setPersonError(`${name} is already in this Venn. Use a name everyone can tell apart.`);
    setPeople(list => [...list, name.slice(0, MAX_NAME)]);
    setNewPerson('');
    setPersonError('');
  };

  const startOver = () => {
    drafts.delete(draftKey);
    setVennName('');
    setYou('');
    setPeople([]);
    setPlan(null);
    setNewPerson('');
    setPersonError('');
    setYouError('');
    setShowRestored(false);
  };

  const toRules = () => {
    let ok = true;
    if (newPerson.trim()) {
      setPersonError('Tap Add to include this person, or clear the field.');
      ok = false;
    } else if (type !== 'personal' && !people.length) {
      setPersonError(`Add at least one other person. A ${title} Venn is for two or more people.`);
      ok = false;
    }
    if (people.some(p => p.toLocaleLowerCase() === youName.toLocaleLowerCase())) {
      setYouError('Someone in the list already has this name. Use a name everyone can tell apart.');
      ok = false;
    }
    if (!ok) return;
    const next = planFor(type, myKey, { vennName, you, people, plan });
    setPlan(next.plan);
    setRecoveryReset(next.recoveryReset);
    setShowRestored(false);
    setStep('rules');
  };

  const save = async () => {
    if (!plan) return;
    setBusy(true);
    setError('');
    try {
      const invite = inviteFor(plan, network, VENN_TEST_USD.category);
      await onSave(invite);
      drafts.delete(draftKey);
      // Saved: stop holding the screen so the app can move on to the invitation.
      setLeaving(true);
      disablePrevention();
      onDone(invite);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const names = plan ? plan.members.map(m => m.name) : [youName, ...people];

  let content: React.ReactNode = null;
  let footer: React.ReactNode = null;

  if (step === 'people') {
    content = (
      <View testID="create-venn-people">
        {showRestored ? (
          <View style={local.restored}>
            <Text style={[s.body, s.fill]}>Your unsaved draft is back.</Text>
            <Chip label="Start over" onPress={startOver} testID="venn-draft-start-over" />
          </View>
        ) : null}
        <Field
          label="Name of this Venn"
          hint="Everyone you invite sees this name."
          value={vennName}
          onChangeText={setVennName}
          maxLength={MAX_NAME}
          placeholder={`${title} Venn`}
          testID="venn-name"
        />
        <Field
          label="Your name"
          hint="How the others see you in this Venn."
          error={youError}
          value={you}
          onChangeText={t => {
            setYou(t);
            setYouError('');
          }}
          maxLength={MAX_NAME}
          placeholder="You"
          testID="venn-your-name"
        />
        <Section
          title={type === 'personal' ? 'Friends who protect it' : 'People in it'}
          action={
            <Text style={local.count}>
              {seatsLeft > 0 ? `${seatsLeft} of ${MAX_SEATS - 1} places left` : 'Full'}
            </Text>
          }
        />
        <View style={s.detailCard}>
          <View style={s.networkOption}>
            <Text style={[s.cardTitle, s.fill]}>{youName}</Text>
            <Text style={s.detailLabel}>You</Text>
          </View>
          {people.map((p, n) => (
            <View key={`${p}${n}`}>
              <View style={s.hairline} />
              <View style={s.networkOption}>
                <Text style={[s.cardTitle, s.fill]}>{p}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${p}`}
                  hitSlop={10}
                  onPress={() => {
                    setPeople(list => list.filter((_, i) => i !== n));
                    setPersonError('');
                  }}
                  style={({ pressed }) => [local.remove, pressed ? s.pressed : null]}
                >
                  <X size={18} color={c.muted} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
        {type === 'personal' && !people.length ? (
          <Text style={[s.weakness, local.gap]}>Without friends, recovery is off. {WEAKNESS.recoveryOff}</Text>
        ) : null}
        <View style={local.gap}>
          {seatsLeft > 0 ? (
            <>
              <Field
                label={type === 'personal' ? 'Add a friend' : 'Add a person'}
                hint="Each person accepts with their own Venn app before anything is created."
                error={personError}
                value={newPerson}
                onChangeText={t => {
                  setNewPerson(t);
                  setPersonError('');
                }}
                maxLength={MAX_NAME}
                placeholder="Their name"
                returnKeyType="done"
                submitBehavior="submit"
                onSubmitEditing={addPerson}
                // The field and its Add button end the step; keep both above the footer and keyboard.
                onFocus={() => {
                  followEnd.current = true;
                  scroll.current?.scrollToEnd({ animated: true });
                }}
                onBlur={() => {
                  followEnd.current = false;
                }}
                testID="venn-new-person"
              />
              <View style={local.addRow}>
                <Chip label="Add" onPress={addPerson} testID="add-person" />
              </View>
            </>
          ) : (
            <Note>
              This Venn is full. An invitation holds at most {MAX_SEATS} people, including you. Remove someone to add
              another person.
            </Note>
          )}
        </View>
      </View>
    );
    footer = <PillButton label="Next: rules" testID="venn-people-next" onPress={toRules} />;
  }

  if (step === 'rules' && plan) {
    content = (
      <View testID="create-venn-rules">
        <Text style={s.body}>
          Every option is yours to change, and each one shows its weakness. Nothing is final until everyone accepts.
        </Text>
        <Section
          title="People"
          action={<Chip label="Edit people" onPress={() => setStep('people')} testID="venn-edit-people" />}
        />
        <View style={s.detailCard}>
          <DetailRow first label="Venn" value={plan.name} />
          <DetailRow stacked label={`${names.length} ${names.length === 1 ? 'person' : 'people'}`} value={names.join(', ')} />
        </View>

        {type === 'circle' && plan.circle ? (
          <>
            <Section title="Each round" />
            <View style={[s.detailCard, local.cardGap]}>
              <Amount
                id="contribution"
                report={report}
                label="Everyone pays (Venn Test USD)"
                value={plan.circle.contribution}
                onChange={contribution => setPlan(p => (p?.circle ? { ...p, circle: { ...p.circle, contribution } } : p))}
              />
              <Amount
                id="round"
                report={report}
                label="Each round lasts (days)"
                value={plan.circle.period}
                days
                onChange={period => setPlan(p => (p?.circle ? { ...p, circle: { ...p.circle, period } } : p))}
              />
              <Text style={[s.weakness, local.capWeakness]}>
                The pot each round is {formatTestUsd(plan.circle.contribution * BigInt(plan.members.length))} {VENN_TEST_USD.symbol}.
                After a round’s deadline anyone can pay out what was paid in, so late payments miss that round.
              </Text>
            </View>
          </>
        ) : (
          <>
        <Section title="What each person can do" />
          {plan.members.map((m, n) => (
            <View key={n} style={[s.detailCard, local.cardGap]}>
              <Text style={[s.cardTitle, local.cardTitle]}>{m.name}</Text>
              {ROLE_OPTIONS.map(r => (
                <Toggle
                  key={r.role}
                  label={r.label}
                  detail={WEAKNESS.roles[r.role]}
                  value={(m.roles & r.role) === r.role}
                  onChange={on => {
                    const roles = on ? m.roles | r.role : m.roles & ~r.role;
                    const spends = (roles & ROLE.SPEND) === ROLE.SPEND;
                    member(n, {
                      roles: on && r.role === ROLE.REQUIRED ? roles | ROLE.VOTE : roles,
                      ...(spends && m.budgetMode === BUDGET.NONE
                        ? { budgetMode: BUDGET.REFILL, budget: 100_000n, period: DAY }
                        : {}),
                      ...(!spends ? { budgetMode: BUDGET.NONE, budget: 0n, period: 0n, cap: 0n } : {}),
                    });
                  }}
                />
              ))}
              {(m.roles & ROLE.SPEND) === ROLE.SPEND ? (
                <View style={local.budget}>
                  <Choice
                    title="Budget"
                    value={m.budgetMode}
                    onChange={budgetMode => member(n, { budgetMode })}
                    options={withWeakness(BUDGETS, m.budgetMode)}
                  />
                  <Amount
                    id={`budget-${n}`}
                    report={report}
                    label="Budget (Venn Test USD)"
                    value={m.budget}
                    onChange={budget => member(n, { budget })}
                  />
                  <Amount
                    id={`period-${n}`}
                    report={report}
                    label="Over how many days"
                    value={m.period}
                    days
                    onChange={period => member(n, { period })}
                  />
                  <Amount
                    id={`cap-${n}`}
                    report={report}
                    label="Largest single payment (0 = no limit)"
                    value={m.cap}
                    onChange={cap => member(n, { cap })}
                  />
                  <Text style={[s.weakness, local.capWeakness]}>{WEAKNESS.cap}</Text>
                </View>
              ) : (
                <Text style={[s.weakness, local.capWeakness]}>{WEAKNESS.budget[BUDGET.NONE]}</Text>
              )}
            </View>
          ))}
  
          <Section title="Votes" />
          <View style={local.choices}>
            <Choice
              title="Payments beyond a budget need"
              value={plan.settings.payments}
              onChange={payments => settings({ payments: payments as 1 | 2 })}
              options={withWeakness(RULES.slice(1), plan.settings.payments)}
            />
            {CATEGORIES.map(([key, label]) => (
              <Choice
                key={key}
                title={label}
                value={plan.settings[key]}
                onChange={v => settings({ [key]: v })}
                options={withWeakness(RULES, plan.settings[key])}
              />
            ))}
          </View>
  
          <Section title="Lost keys" />
          {recoveryReset ? (
            <Note>The group changed, so recovery starts again from the {title} defaults. Check it below.</Note>
          ) : null}
          <View style={s.detailCard}>
            <Toggle
              label="Recovery of lost keys"
              detail={
                plan.settings.recoveryOn
                  ? 'Helpers can give a seat a new key after a wait. Enough helpers working together can take over a seat after the wait.'
                  : WEAKNESS.recoveryOff
              }
              value={plan.settings.recoveryOn}
              onChange={on =>
                settings(
                  on
                    ? {
                        recoveryOn: true,
                        helpersNeeded: 1,
                        waitUnits: daysToUnits(7),
                        stopRule: STOP.VOTERS,
                        strongNeeded: 0,
                        strongWaitUnits: 0,
                      }
                    : RECOVERY_OFF,
                )
              }
            />
            {plan.settings.recoveryOn ? (
              <View style={local.budget}>
                <Count
                  id="helpers"
                  report={report}
                  label="Helpers needed"
                  value={plan.settings.helpersNeeded}
                  min={1}
                  onChange={helpersNeeded => settings({ helpersNeeded })}
                />
                <Count
                  id="wait"
                  report={report}
                  label="Waiting period (days)"
                  value={unitsToDays(plan.settings.waitUnits)}
                  min={1}
                  onChange={d => settings({ waitUnits: daysToUnits(d) })}
                />
                <Choice
                  title="Who can stop a request"
                  value={plan.settings.stopRule}
                  onChange={stopRule =>
                    settings(
                      stopRule === STOP.BOTH
                        ? {
                            stopRule,
                            strongNeeded: Math.max(plan.settings.helpersNeeded, 1),
                            strongWaitUnits: plan.settings.waitUnits * 2,
                          }
                        : { stopRule, strongNeeded: 0, strongWaitUnits: 0 },
                    )
                  }
                  options={withWeakness(STOPS, plan.settings.stopRule)}
                />
                {plan.settings.stopRule === STOP.BOTH ? (
                  <>
                    <Count
                      id="strong"
                      report={report}
                      label="Helpers for the stronger path"
                      value={plan.settings.strongNeeded}
                      min={1}
                      onChange={strongNeeded => settings({ strongNeeded })}
                    />
                    <Count
                      id="strong-wait"
                      report={report}
                      label="Stronger path wait (days)"
                      value={unitsToDays(plan.settings.strongWaitUnits)}
                      min={1}
                      onChange={d => settings({ strongWaitUnits: daysToUnits(d) })}
                    />
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
          </>
        )}
        {plan.turns ? (
          <>
            <Section title="Turn order" />
            <View style={s.detailCard}>
              {plan.turns.map((seat, n) => (
                <View key={seat} style={s.networkOption}>
                  <Text style={[s.cardTitle, s.fill]}>
                    {n + 1}. {plan.members[seat].name}
                  </Text>
                  {n ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${plan.members[seat].name} earlier`}
                      hitSlop={10}
                      onPress={() =>
                        setPlan(p => {
                          if (!p?.turns) return p;
                          const turns = [...p.turns];
                          [turns[n - 1], turns[n]] = [turns[n], turns[n - 1]];
                          return { ...p, turns };
                        })
                      }
                      style={local.remove}
                    >
                      <ArrowDown size={18} color={c.muted} style={{ transform: [{ rotate: '180deg' }] }} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
              <Text style={[s.weakness, local.capWeakness]}>{TYPES.circle.weakness}</Text>
            </View>
          </>
        ) : null}
      </View>
    );
    footer = (
      <>
        {invalid.size ? (
          <Note danger>Fix the fields marked in red first. The plan still uses their last valid values.</Note>
        ) : problem ? (
          <Note danger>{problem}</Note>
        ) : null}
        <PillButton
          label="Next: review"
          testID="venn-rules-next"
          disabled={Boolean(problem) || invalid.size > 0}
          onPress={() => setStep('review')}
        />
      </>
    );
  }

  if (step === 'review' && plan) {
    content = (
      <View testID="create-venn-summary">
        <Section
          title="Plan"
          action={<Chip label="Edit people" onPress={() => setStep('people')} testID="venn-review-edit-people" />}
        />
        <View style={s.detailCard}>
          <DetailRow first label="Name" value={plan.name} testID="venn-review-name" />
          <DetailRow label="Type" value={type === 'circle' ? 'Circle' : `${title} Venn`} />
          <DetailRow label="Money" value={VENN_TEST_USD.symbol} />
          <DetailRow label="Network" value={network === 'chipnet' ? 'Chipnet (test network)' : network} />
          <DetailRow stacked label={`${names.length} ${names.length === 1 ? 'person' : 'people'}`} value={names.join(', ')} />
          <DetailRow
            stacked
            label="Starts"
            value={
              names.length > 1
                ? `Only after ${names.length === 2 ? `${names[1]} accepts` : `all ${names.length - 1} invited people accept`}. Nothing is created on Chipnet before that.`
                : 'When you create it. Nobody else needs to accept.'
            }
          />
        </View>
        <Text style={[s.weakness, local.typeWeakness]}>
          Weakness of a {title} Venn: {TYPES[type].weakness}
        </Text>
        <Section
          title="Rules"
          action={<Chip label="Change rules" onPress={() => setStep('rules')} testID="venn-edit-rules" />}
        />
        <View style={s.detailCard}>
          {(plan.circle
            ? [
                { text: `Each round, everyone pays ${formatTestUsd(plan.circle.contribution)} ${VENN_TEST_USD.symbol}, and the whole pot goes to the member whose turn it is.` },
                { text: `A round lasts ${Number(plan.circle.period) / 86_400} days. It pays out when everyone has paid, or after the deadline.`, weakness: TYPES.circle.weakness },
              ]
            : summarize(plan.members, plan.settings, VENN_TEST_USD.symbol)
          ).map((line: { text: string; weakness?: string }, n) => (
            <View key={n}>
              {n ? <View style={s.hairline} /> : null}
              <View style={s.summaryLine}>
                <Text style={[s.body, s.inkText]}>{line.text}</Text>
                {line.weakness ? <Text style={s.weakness}>Weakness: {line.weakness}</Text> : null}
              </View>
            </View>
          ))}
        </View>
        {plan.turns ? (
          <>
            <Section title="Turn order" />
            <View style={s.detailCard}>
              {plan.turns.map((seat, n) => (
                <DetailRow key={seat} first={!n} label={`Turn ${n + 1}`} value={plan.members[seat].name} />
              ))}
            </View>
          </>
        ) : null}
      </View>
    );
    footer = (
      <>
        {error ? <Note danger>{error}</Note> : null}
        <PillButton
          label={busy ? 'Saving…' : 'Save and share invitation'}
          testID="venn-save-plan"
          disabled={busy}
          onPress={save}
        />
      </>
    );
  }

  const { n, title: stepTitle } = STEPS[step];
  return (
    <SafeAreaView style={s.root} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={s.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardOffset}
      >
        <ScrollView
          ref={scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          onLayout={() => {
            if (followEnd.current) scroll.current?.scrollToEnd({ animated: true });
          }}
        >
          <View style={local.progress} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[1, 2, 3, 4].map(i => (
              <View key={i} style={[local.track, i <= n ? local.trackDone : null]} />
            ))}
          </View>
          <Text style={local.eyebrow} accessibilityElementsHidden importantForAccessibility="no">
            Step {n} of 4 · {title} Venn
          </Text>
          <Text
            accessibilityRole="header"
            accessibilityLabel={`Step ${n} of 4, ${stepTitle}`}
            style={local.heading}
            testID="venn-step-title"
          >
            {stepTitle}
          </Text>
          {content}
        </ScrollView>
        {footer ? <View style={local.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const local = StyleSheet.create({
  progress: { flexDirection: 'row', gap: 6, marginTop: 4 },
  track: { flex: 1, height: 3, borderRadius: 2, backgroundColor: c.border },
  trackDone: { backgroundColor: c.ink },
  eyebrow: { color: c.muted, fontSize: 13, fontWeight: '600', marginTop: 12 },
  heading: { color: c.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.6, marginTop: 2, marginBottom: 14 },
  section: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22, marginBottom: 10, minHeight: 40 },
  count: { color: c.muted, fontSize: 13 },
  restored: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  remove: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  gap: { marginTop: 12 },
  addRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: -6, marginBottom: 8 },
  cardGap: { marginBottom: 12, paddingBottom: 14 },
  cardTitle: { paddingTop: 16, fontSize: 17 },
  budget: { marginTop: 8, marginBottom: 6, padding: 12, borderRadius: 18, backgroundColor: c.background },
  capWeakness: { marginBottom: 2 },
  choices: { gap: 8 },
  typeWeakness: { marginTop: 10 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: c.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
});
