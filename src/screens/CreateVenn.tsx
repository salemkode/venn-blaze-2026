// Create a Venn: pick a type, name the people, change anything, read the summary, then
// share the invitation. Nothing reaches the chain until everyone has accepted.
//
// Drawn as an iOS grouped list (see venn-create/form.tsx): one level of white groups on the
// grey page, segmented controls for small choices, steppers for counts, a sheet per person.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultStopRule } from '../venn/recoveryGuard';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  type TextInputInstance,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePreventRemove } from 'expo-router';
import { ArrowUp, CircleMinus, Plus } from 'lucide-react-native';
import { formatAssetAmount, parseCents, vennAsset } from '../venn/asset';
import { colors as c } from '../ui/theme';
import { styles as s } from '../ui/styles';
import { Note, PillButton } from '../ui/kit';
import { useKeyboardOffset } from '../ui/Page';
import { ROLE, RULE, STOP } from '../venn/layout';
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
import { budgetText, roleNames, summarize } from '../venn/summary';
import { inviteFor, type Invite } from '../venn/invite';
import type { Network } from '../wallet/prefs';
import {
  AmountRow,
  Group,
  GroupAction,
  InfoRow,
  LinkRow,
  type Report,
  Row,
  SegmentRow,
  StepperRow,
  SwitchRow,
  TextRow,
  Weakness,
} from './venn-create/form';
import { PersonSheet } from './venn-create/PersonSheet';

/** The contracts hold at most 16 voters (Venn) or members (Circle), including the creator. */
const MAX_SEATS = 16;
const MAX_NAME = 40;
/** Names are typed as written: no autocorrect turning "Salem" into "Salem's". */
const NAME_INPUT = { autoCorrect: false, spellCheck: false, autoCapitalize: 'words', maxLength: MAX_NAME } as const;

const RULES = [
  { value: RULE.LOCKED, short: 'Locked', weakness: WEAKNESS.rule[RULE.LOCKED] },
  { value: RULE.MAJORITY, short: 'Majority', weakness: WEAKNESS.rule[RULE.MAJORITY] },
  { value: RULE.EVERYONE, short: 'Everyone', weakness: WEAKNESS.rule[RULE.EVERYONE] },
];
const STOPS = [
  { value: STOP.KEY, short: 'Their key', meaning: 'The seat’s current key can stop a request.', weakness: WEAKNESS.stop[STOP.KEY] },
  { value: STOP.VOTERS, short: 'Voters', meaning: 'A majority of voters can stop a request.', weakness: WEAKNESS.stop[STOP.VOTERS] },
  { value: STOP.BOTH, short: 'Both', meaning: 'A normal path, and a stronger path with its own helpers and wait.', weakness: WEAKNESS.stop[STOP.BOTH] },
];
/** Each kind of decision and the rules it can take. Payments can never be locked. */
const VOTES = [
  { key: 'payments', label: 'Payments beyond a budget', options: RULES.slice(1) },
  { key: 'membership', label: 'Adding or removing members', options: RULES },
  { key: 'spending', label: 'Changing budgets', options: RULES },
  { key: 'recoveryRule', label: 'Changing recovery', options: RULES },
  { key: 'governance', label: 'Changing these rules', options: RULES },
] as const;
const HELPER = ['helper', 'helpers'] as const;
const DAYS = ['day', 'days'] as const;

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
  const asset = vennAsset(network);
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
  /** The person whose sheet is open, if any. */
  const [sheet, setSheet] = useState<number | null>(null);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const youField = useRef<TextInputInstance>(null);
  const personField = useRef<TextInputInstance>(null);
  const keyboardOffset = useKeyboardOffset();
  /** True while the add-person field is focused, so the view follows it as the keyboard opens. */
  const followEnd = useRef(false);
  const viewport = useRef({ height: 0, content: 0 });
  const scrollToBottom = () =>
    scroll.current?.scrollTo({ y: Math.max(0, viewport.current.content - viewport.current.height), animated: true });
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
  const kindName = type === 'circle' ? 'Circle' : `${title} Venn`;

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

  // The progress row gives its space back while typing.
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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

  const personProblem = (name: string) => {
    if (!name) return 'Type a name first.';
    if (seatsLeft <= 0) return `A Venn holds at most ${MAX_SEATS} people, including you.`;
    if (taken(name)) return `${name} is already in this Venn. Use a name everyone can tell apart.`;
    return '';
  };

  /** Adds the typed name and keeps the field focused for the next one. */
  const addPerson = () => {
    const name = newPerson.trim();
    const why = personProblem(name);
    if (why) return setPersonError(why);
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
    // A name still in the field is added, as if Add had been tapped.
    let list = people;
    const pending = newPerson.trim();
    if (pending) {
      const why = personProblem(pending);
      if (why) {
        setPersonError(why);
        ok = false;
      } else {
        list = [...people, pending.slice(0, MAX_NAME)];
        setPeople(list);
        setNewPerson('');
      }
    }
    if (ok && type !== 'personal' && !list.length) {
      setPersonError(`Add at least one other person. A ${title} Venn is for two or more people.`);
      ok = false;
    }
    if (list.some(p => p.toLocaleLowerCase() === youName.toLocaleLowerCase())) {
      setYouError('Someone in the list already has this name. Use a name everyone can tell apart.');
      ok = false;
    }
    if (!ok) return;
    const next = planFor(type, myKey, { vennName, you, people: list, plan });
    setPlan(next.plan);
    setRecoveryReset(next.recoveryReset);
    setShowRestored(false);
    setSheet(null);
    Keyboard.dismiss();
    setStep('rules');
  };

  const save = async () => {
    if (!plan) return;
    setBusy(true);
    setError('');
    try {
      const invite = inviteFor(plan, network, asset.category);
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
  const helpers = plan ? Math.max(1, plan.members.filter(m => (m.roles & ROLE.HELPER) === ROLE.HELPER).length) : 1;

  let content: React.ReactNode = null;
  let footer: React.ReactNode = null;

  if (step === 'people') {
    const typed = newPerson.trim();
    content = (
      <View testID="create-venn-people">
        {showRestored ? (
          <View style={local.restored}>
            <Text style={[s.body, s.fill]}>Your unsaved draft is back.</Text>
            <GroupAction label="Start over" onPress={startOver} testID="venn-draft-start-over" />
          </View>
        ) : null}
        <Group title="Names" footer="Everyone you invite sees these names.">
          <TextRow
            label="Name of this Venn"
            value={vennName}
            onChangeText={setVennName}
            {...NAME_INPUT}
            textContentType="none"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => youField.current?.focus()}
            placeholder={kindName}
            testID="venn-name"
          />
          <TextRow
            ref={youField}
            label="Your name"
            error={youError}
            value={you}
            onChangeText={t => {
              setYou(t);
              setYouError('');
            }}
            {...NAME_INPUT}
            textContentType="name"
            autoComplete="name"
            returnKeyType={seatsLeft > 0 ? 'next' : 'done'}
            submitBehavior={seatsLeft > 0 ? 'submit' : 'blurAndSubmit'}
            onSubmitEditing={() => personField.current?.focus()}
            placeholder="You"
            testID="venn-your-name"
          />
        </Group>
        <Group
          title={type === 'personal' ? 'Friends who protect it' : 'People in it'}
          action={<Text style={local.count}>{seatsLeft > 0 ? `${seatsLeft} places left` : 'Full'}</Text>}
          footer={
            type === 'personal' && !people.length ? (
              <Weakness style={local.groupNote}>Without friends, recovery is off. {WEAKNESS.recoveryOff}</Weakness>
            ) : (
              'Each person accepts with their own Venn app before anything is created.'
            )
          }
        >
          <Row label={youName}>{you.trim() ? <Text style={local.youTag}>You</Text> : null}</Row>
          {people.map((p, n) => (
            <Row key={`${p}${n}`} label={p}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${p}`}
                hitSlop={8}
                onPress={() => {
                  setPeople(list => list.filter((_, i) => i !== n));
                  setPersonError('');
                }}
                style={({ pressed }) => [local.remove, pressed ? s.pressed : null]}
              >
                <CircleMinus size={22} color={c.danger} strokeWidth={2} />
              </Pressable>
            </Row>
          ))}
          {seatsLeft > 0 ? (
            <TextRow
              ref={personField}
              label={type === 'personal' ? 'Add a friend' : 'Add a person'}
              error={personError}
              value={newPerson}
              onChangeText={t => {
                setNewPerson(t);
                setPersonError('');
              }}
              {...NAME_INPUT}
              textContentType="none"
              placeholder="Their name"
              returnKeyType="done"
              enablesReturnKeyAutomatically
              // Return adds the name and keeps the keyboard up for the next person.
              submitBehavior="submit"
              onSubmitEditing={addPerson}
              // The field ends the step; keep it above the footer and keyboard.
              onFocus={() => {
                followEnd.current = true;
                scrollToBottom();
              }}
              onBlur={() => {
                followEnd.current = false;
              }}
              testID="venn-new-person"
              trailing={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={typed ? `Add ${typed}` : 'Add this person'}
                  accessibilityState={{ disabled: !typed }}
                  disabled={!typed}
                  onPress={addPerson}
                  testID="add-person"
                  style={({ pressed }) => [local.add, typed ? null : local.addIdle, pressed ? s.pressed : null]}
                >
                  <Plus size={16} color={typed ? c.paper : c.faint} strokeWidth={2.75} />
                  <Text style={[local.addLabel, typed ? null : local.addLabelIdle]}>Add</Text>
                </Pressable>
              }
            />
          ) : (
            <Row
              label="This Venn is full"
              detail={`An invitation holds at most ${MAX_SEATS} people, including you. Remove someone to add another.`}
            />
          )}
        </Group>
      </View>
    );
    footer = <PillButton label="Continue to rules" testID="venn-people-next" onPress={toRules} />;
  }

  if (step === 'rules' && plan) {
    const open = sheet === null ? null : plan.members[sheet];
    const sheetLocked = sheet !== null && ['budget', 'period', 'cap'].some(id => invalid.has(`${id}-${sheet}`));
    content = (
      <View testID="create-venn-rules">
        <Text style={s.body}>Change anything here. Each choice shows its weakness, and nothing is final until everyone accepts.</Text>

        {type === 'circle' && plan.circle ? (
          <Group
            title="Each round"
            footer={
              <View style={local.groupNotes}>
                <Text style={local.noteText}>
                  The pot each round is {formatAssetAmount(plan.circle.contribution * BigInt(plan.members.length))} {asset.symbol}.
                </Text>
                <Weakness>After a round’s deadline anyone can pay out what was paid in, so late payments miss that round.</Weakness>
              </View>
            }
          >
            <AmountRow
              id="contribution"
              report={report}
              label="Everyone pays"
              detail={asset.symbol}
              value={plan.circle.contribution}
              format={formatAssetAmount}
              parse={(text: string) => parseCents(text)}
              onChange={contribution => setPlan(p => (p?.circle ? { ...p, circle: { ...p.circle, contribution } } : p))}
              testID="venn-contribution"
            />
            <StepperRow
              id="round"
              report={report}
              label="Each round lasts"
              unit={DAYS}
              min={1}
              value={Math.max(1, Math.round(Number(plan.circle.period) / Number(DAY)))}
              onChange={d => setPlan(p => (p?.circle ? { ...p, circle: { ...p.circle, period: BigInt(d) * DAY } } : p))}
              testID="venn-round"
            />
          </Group>
        ) : (
          <>
            <Group
              title="What each person can do"
              action={<GroupAction label="Edit names" onPress={() => setStep('people')} testID="venn-edit-people" />}
            >
              {plan.members.map((m, n) => {
                const roles = roleNames(m.roles).join(' · ');
                return (
                  <LinkRow
                    key={n}
                    label={n === 0 && you.trim() ? `${m.name} (you)` : m.name}
                    lines={[roles ? roles[0].toUpperCase() + roles.slice(1) : 'No roles', budgetText(m, asset.symbol)]}
                    accessibilityHint="Opens what this person can do."
                    onPress={() => setSheet(n)}
                    testID={`venn-person-${n}`}
                  />
                );
              })}
            </Group>

            <Group title="Decided by vote">
              {VOTES.map(({ key, label, options }) => (
                <SegmentRow
                  key={key}
                  label={label}
                  options={options}
                  value={plan.settings[key]}
                  onChange={v => settings({ [key]: v })}
                  testID={`venn-vote-${key}`}
                />
              ))}
            </Group>

            <Group
              title="Lost keys"
              footer={recoveryReset ? `The group changed, so recovery went back to the ${kindName} defaults.` : undefined}
            >
              <SwitchRow
                label="Recover lost keys"
                detail={
                  plan.settings.recoveryOn
                    ? 'Helpers can give a seat a new key after a wait.'
                    : WEAKNESS.recoveryOff
                }
                value={plan.settings.recoveryOn}
                onChange={on =>
                  settings(
                    on
                      ? { recoveryOn: true, helpersNeeded: 1, waitUnits: daysToUnits(7), stopRule: defaultStopRule(plan.members.filter(m => m.roles & ROLE.VOTE).length), strongNeeded: 0, strongWaitUnits: 0 }
                      : RECOVERY_OFF,
                  )
                }
                testID="venn-recovery"
              />
              {plan.settings.recoveryOn ? (
                <StepperRow
                  id="helpers"
                  report={report}
                  label="Helpers needed"
                  detail={`Of ${helpers} who can help`}
                  unit={HELPER}
                  value={plan.settings.helpersNeeded}
                  min={1}
                  max={helpers}
                  onChange={helpersNeeded => settings({ helpersNeeded })}
                  testID="venn-helpers"
                />
              ) : null}
              {plan.settings.recoveryOn ? (
                <StepperRow
                  id="wait"
                  report={report}
                  label="Waiting period"
                  unit={DAYS}
                  value={unitsToDays(plan.settings.waitUnits)}
                  min={1}
                  onChange={d => settings({ waitUnits: daysToUnits(d) })}
                  testID="venn-wait"
                />
              ) : null}
              {plan.settings.recoveryOn ? (
                <SegmentRow
                  label="Who can stop a request"
                  options={STOPS}
                  value={plan.settings.stopRule}
                  onChange={stopRule =>
                    settings(
                      stopRule === STOP.BOTH
                        ? { stopRule, strongNeeded: Math.max(plan.settings.helpersNeeded, 1), strongWaitUnits: plan.settings.waitUnits * 2 }
                        : { stopRule, strongNeeded: 0, strongWaitUnits: 0 },
                    )
                  }
                  testID="venn-stop"
                />
              ) : null}
              {plan.settings.recoveryOn && plan.settings.stopRule === STOP.BOTH ? (
                <StepperRow
                  id="strong"
                  report={report}
                  label="Stronger path helpers"
                  unit={HELPER}
                  max={helpers}
                  value={plan.settings.strongNeeded}
                  min={1}
                  onChange={strongNeeded => settings({ strongNeeded })}
                />
              ) : null}
              {plan.settings.recoveryOn && plan.settings.stopRule === STOP.BOTH ? (
                <StepperRow
                  id="strong-wait"
                  report={report}
                  label="Stronger path wait"
                  unit={DAYS}
                  value={unitsToDays(plan.settings.strongWaitUnits)}
                  min={1}
                  onChange={d => settings({ strongWaitUnits: daysToUnits(d) })}
                />
              ) : null}
            </Group>
            {plan.settings.recoveryOn ? (
              <Weakness style={local.groupNote}>Enough helpers working together can take over a seat after the wait.</Weakness>
            ) : null}
          </>
        )}
        {plan.turns ? (
          <Group title="Turn order" footer={<Weakness style={local.groupNote}>{TYPES.circle.weakness}</Weakness>}>
            {plan.turns.map((seat, n) => (
              <Row key={seat} label={`${n + 1}.  ${plan.members[seat].name}`}>
                {n ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${plan.members[seat].name} earlier`}
                    hitSlop={8}
                    onPress={() =>
                      setPlan(p => {
                        if (!p?.turns) return p;
                        const turns = [...p.turns];
                        [turns[n - 1], turns[n]] = [turns[n], turns[n - 1]];
                        return { ...p, turns };
                      })
                    }
                    style={({ pressed }) => [local.remove, pressed ? s.pressed : null]}
                  >
                    <ArrowUp size={20} color={c.ink} strokeWidth={2} />
                  </Pressable>
                ) : null}
              </Row>
            ))}
          </Group>
        ) : null}
        {open && sheet !== null ? (
          <PersonSheet
            member={open}
            n={sheet}
            you={sheet === 0 && Boolean(you.trim())}
            locked={sheetLocked}
            report={report}
            onChange={change => member(sheet, change)}
            onClose={() => setSheet(null)}
            unit={asset.symbol}
          />
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
          label="Continue to review"
          testID="venn-rules-next"
          disabled={Boolean(problem) || invalid.size > 0}
          onPress={() => setStep('review')}
        />
      </>
    );
  }

  if (step === 'review' && plan) {
    const lines: { text: string; weakness?: string }[] = plan.circle
      ? [
          { text: `Each round, everyone pays ${formatAssetAmount(plan.circle.contribution)} ${asset.symbol}, and the whole pot goes to the member whose turn it is.` },
          { text: `A round lasts ${Number(plan.circle.period) / 86_400} days. It pays out when everyone has paid, or after the deadline.`, weakness: TYPES.circle.weakness },
        ]
      : summarize(plan.members, plan.settings, asset.symbol);
    content = (
      <View testID="create-venn-summary">
        <Group
          title="Plan"
          action={<GroupAction label="Edit names" onPress={() => setStep('people')} testID="venn-review-edit-people" />}
          footer={<Weakness style={local.groupNote}>{`Weakness of a ${kindName}: ${TYPES[type].weakness}`}</Weakness>}
        >
          <InfoRow label="Name" value={plan.name} testID="venn-review-name" />
          <InfoRow label="Type" value={kindName} />
          <InfoRow label="Money" value={asset.symbol} />
          <InfoRow label="Network" value={network === 'chipnet' ? 'Chipnet (test network)' : 'Mainnet (real money)'} />
          <InfoRow stacked label={`${names.length} ${names.length === 1 ? 'person' : 'people'}`} value={names.join(', ')} />
          <InfoRow
            stacked
            label="Starts"
            value={
              names.length > 1
                ? `Only after ${names.length === 2 ? `${names[1]} accepts` : `all ${names.length - 1} invited people accept`}. Nothing is created on ${network === 'mainnet' ? 'Mainnet' : 'Chipnet'} before that.`
                : 'When you create it. Nobody else needs to accept.'
            }
          />
        </Group>
        <Group title="Rules" action={<GroupAction label="Change" onPress={() => setStep('rules')} testID="venn-edit-rules" />}>
          {lines.map((line, n) => (
            <View key={n} style={local.summaryLine}>
              <Text style={local.summaryText}>{line.text}</Text>
              {line.weakness ? <Weakness>{line.weakness}</Weakness> : null}
            </View>
          ))}
        </Group>
        {plan.turns ? (
          <Group title="Turn order">
            {plan.turns.map((seat, n) => (
              <InfoRow key={seat} label={`Turn ${n + 1}`} value={plan.members[seat].name} />
            ))}
          </Group>
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
          keyboardDismissMode="interactive"
          // While adding people, the list grows and the keyboard moves: keep the field in view.
          // scrollToEnd can stop short while the keyboard animates, so scroll to the exact end.
          onLayout={e => {
            viewport.current.height = e.nativeEvent.layout.height;
            if (followEnd.current) scrollToBottom();
          }}
          onContentSizeChange={(_, height) => {
            viewport.current.content = height;
            if (followEnd.current) scrollToBottom();
          }}
        >
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
        <View style={local.footer}>
          {/* Where you are sits next to the button that moves you on, not above the fields. */}
          {keyboardUp ? null : (
            <View
              style={local.progress}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`${stepTitle}, step ${n} of 4`}
              accessibilityValue={{ min: 1, max: 4, now: n }}
              testID="venn-step-progress"
            >
              <Text style={local.progressText}>
                Step {n} of 4 · {kindName}
              </Text>
              <View style={local.tracks}>
                {[1, 2, 3, 4].map(i => (
                  <View key={i} style={[local.track, i < n ? local.trackDone : i === n ? local.trackNow : null]} />
                ))}
              </View>
            </View>
          )}
          {footer}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const local = StyleSheet.create({
  progress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  progressText: { color: c.muted, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  tracks: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  track: { width: 16, height: 4, borderRadius: 2, backgroundColor: c.border },
  trackDone: { backgroundColor: c.ink },
  trackNow: { width: 30, backgroundColor: c.ink },
  heading: { color: c.ink, fontSize: 32, fontWeight: '700', letterSpacing: -0.8, marginTop: 4, marginBottom: 8 },
  count: { color: c.muted, fontSize: 13, lineHeight: 18 },
  restored: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  youTag: { color: c.muted, fontSize: 15 },
  remove: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: c.ink },
  addIdle: { backgroundColor: c.tile },
  addLabel: { color: c.paper, fontSize: 15, fontWeight: '700' },
  addLabelIdle: { color: c.faint },
  groupNote: { marginTop: 8, paddingHorizontal: 16 },
  groupNotes: { marginTop: 8, paddingHorizontal: 16, gap: 6 },
  noteText: { color: c.muted, fontSize: 13, lineHeight: 18 },
  summaryLine: { paddingHorizontal: 16, paddingVertical: 14, gap: 6 },
  summaryText: { color: c.ink, fontSize: 15, lineHeight: 22 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: c.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
});
