// The Venn screens: the list on the Venns tab, a plan waiting for acceptances, joining with an
// invitation, and a Venn's own page with paying from your budget.
import React, { useState } from 'react';
import { Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { BadgeCheck, ChevronRight, Fuel, Share2, ShieldAlert, Users } from 'lucide-react-native';
import { formatBch } from 'react-native-xo/core';
import { colors as c } from '../ui/theme';
import { styles as s } from '../ui/styles';
import { DetailRow, Field, Note, PillButton, SafeQR } from '../ui/kit';
import { confirmAction } from '../ui/confirm';
import { formatSats } from '../ui/format';
import {
  feeUnit,
  formatAssetAmount,
  isVennAsset,
  MUSD,
  networkName,
  parseAssetAmount,
  tokenRecipient,
  VENN_FEE_ALLOCATION,
  VENN_TEST_USD,
  vennAsset,
} from '../venn/asset';
import { type Invite, encodeInvite, fingerprint } from '../venn/invite';
import { BUDGET, ROLE } from '../venn/layout';
import { TYPES } from '../venn/presets';
import { CircleRow, CircleTerms } from './Circle';
import { VennDecisions } from './VennDecisions';
import { type Seat, type Settings, budgetText, money, roleNames, summarize } from '../venn/summary';
import { open as openRoute } from '../navigation';
import { SettingsRow } from '../ui/SettingsList';
import type { VennView, VennsState } from '../venn/useVenns';

const seatsOf = (invite: Invite): Seat[] =>
  invite.seats.map(seat => ({
    ...seat,
    budget: BigInt(seat.budget),
    period: BigInt(seat.period),
    cap: BigInt(seat.cap),
  }));

const unitFor = (asset: { network: 'chipnet' | 'mainnet'; assetCategory?: string }) =>
  isVennAsset(asset) ? vennAsset(asset.network).symbol : asset.assetCategory ? 'base units' : feeUnit(asset.network);

const sats = formatSats;

const amountOnly = (amount: bigint, unit: string) =>
  unit === VENN_TEST_USD.symbol || unit === MUSD.symbol ? formatAssetAmount(amount) : unit === 'base units' ? amount.toString() : formatBch(amount);

const lower = (text: string) => text[0].toLowerCase() + text.slice(1);

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const shareText = (message: string) => {
  Share.share({ message }).catch(() => undefined);
};

function Summary({ seats, settings, unit }: { seats: Seat[]; settings: Settings; unit: string }) {
  return (
    <View style={[s.detailCard, v.summaryCard]}>
      {summarize(seats, settings, unit).map((line, n) => (
        <View key={n} style={s.summaryLine}>
          <Text style={s.body}>{line.text}</Text>
          {line.weakness ? <Text style={s.weakness}>Weakness: {line.weakness}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={[s.sectionTitle, v.sectionTitle]}>
      {children}
    </Text>
  );
}

/** A code or address with a QR that falls back to text when the value is too long. */
function CodeCard({ value, label, full = false }: { value: string; label: string; full?: boolean }) {
  return (
    <View style={[s.receiveCard, v.codeCard]}>
      <View style={s.qr}>
        <SafeQR value={value} />
      </View>
      <Text style={[s.cardEyebrow, s.receiveCaption]}>{label}</Text>
      <Text
        selectable
        numberOfLines={full ? undefined : 3}
        testID="venn-code"
        accessibilityLabel={full ? value : `${label}, ${value.length} characters. Use Share to send it.`}
        style={s.address}
      >
        {value}
      </Text>
    </View>
  );
}

function Step({
  n,
  title,
  status,
  children,
}: {
  n: number;
  title: string;
  status?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={v.step}>
      <View style={v.stepHead}>
        {/* The number and status are part of the heading's label; don't read them twice. */}
        <View style={v.stepNumber} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={v.stepNumberText}>{n}</Text>
        </View>
        <Text
          accessibilityRole="header"
          accessibilityLabel={`Step ${n}: ${title}${status ? `, ${status}` : ''}`}
          style={[s.sectionTitle, s.fill]}
        >
          {title}
        </Text>
        {status ? (
          <Text style={v.stepStatus} accessibilityElementsHidden importantForAccessibility="no">
            {status}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

type SeatStatus = 'You' | 'Accepted' | 'Waiting';
function StatusPill({ status }: { status: SeatStatus }) {
  const style = status === 'Accepted' ? v.pillAccepted : status === 'Waiting' ? v.pillWaiting : v.pillYou;
  const text = status === 'Accepted' ? v.pillAcceptedText : status === 'Waiting' ? v.pillWaitingText : v.pillYouText;
  return (
    <View style={[v.pill, style]}>
      <Text style={[v.pillText, text]}>{status}</Text>
    </View>
  );
}

function FeeBalanceRow({ venns, disabled = false }: { venns: VennsState; disabled?: boolean }) {
  return (
    <View style={v.feeSurface}>
      <SettingsRow
        label="Fee balance"
        detail={`${feeUnit(venns.network)} on your Venn key for network costs`}
        icon={Fuel}
        value={venns.keyBalance === null ? 'Unavailable' : sats(venns.keyBalance)}
        onPress={() => openRoute('fees')}
        disabled={disabled}
        testID="open-fee-balance"
      />
    </View>
  );
}

const waitingText = (seats: number, accepted: number[]) => {
  const others = seats - 1;
  const remaining = Math.max(0, others - new Set(accepted.filter(n => n > 0)).size);
  if (remaining === 0) return 'Everyone accepted · ready to fund';
  if (others === 1) return 'Waiting for 1 person to accept';
  return remaining === others ? `Waiting for all ${others} to accept` : `Waiting for ${remaining} of ${others} to accept`;
};

// Where a browser visitor goes to see Venns working: the signed Android preview, the iPhone
// build on AppDrop, and the 19 November Mainnet run (creation, budget payment, vote and Circle
// with MUSD).
const ANDROID_PREVIEW = 'https://github.com/salemkode/venn-blaze-2026/releases/tag/blaze-2026-android-preview';
const IPHONE_BUILD = 'https://appdrop.app/d/8g7cx3rw6x';
const MAINNET_EVIDENCE = 'https://github.com/salemkode/venn-blaze-2026/blob/hackathon/docs/live-mainnet-2026-11-19.md';

/** The Venns tab. */
export function VennList({ venns, open }: { venns: VennsState; open(sheet: string, options?: any): void }) {
  if (!venns.available)
    return Platform.OS === 'web' ? (
      <View testID="venn-list">
        <View style={v.emptyCard}>
          <View style={s.vennMark}>
            <Users size={20} color={c.paper} />
          </View>
          <Text accessibilityRole="header" style={v.emptyTitle}>
            Venns live in the Venn app
          </Text>
          <Text style={[s.body, v.centered]}>
            A Venn is money a group holds together: everyone spends alone from their own budget, and bigger payments
            need a vote. Each member signs with a key on their own phone, so Venns run in the iOS and Android app.
          </Text>
          <Text style={[s.subtitle, v.centered]}>
            Here you can send and receive BCH with a connected wallet, which keeps its keys.
          </Text>
        </View>
        <View style={v.emptyActions}>
          <PillButton label="Get the Android app" onPress={() => Linking.openURL(ANDROID_PREVIEW)} />
          <PillButton label="Get the iPhone app" secondary onPress={() => Linking.openURL(IPHONE_BUILD)} />
          <PillButton label="See Venns running on Mainnet" secondary onPress={() => Linking.openURL(MAINNET_EVIDENCE)} />
        </View>
      </View>
    ) : (
      <Note>Venns need a wallet whose phrase is on this device.</Note>
    );
  const empty = venns.venns.length === 0 && venns.circles.length === 0 && venns.preparing.length === 0;
  if (empty)
    return (
      <View testID="venn-list">
        <View style={v.emptyCard}>
          <View style={s.vennMark}>
            <Users size={20} color={c.paper} />
          </View>
          <Text accessibilityRole="header" style={v.emptyTitle}>
            Share money on agreed rules
          </Text>
          <Text style={[s.body, v.centered]}>
            A Venn is money a group holds together. Everyone sees who can spend alone, how much, and what needs a
            vote before they join.
          </Text>
          <Text style={[s.subtitle, v.centered]}>
            {venns.network === 'mainnet'
              ? `Venns on Mainnet hold ${MUSD.symbol} and real BCH. The contracts have had internal reviews, not an external audit: keep amounts small.`
              : `Venns on Chipnet hold ${VENN_TEST_USD.symbol}, a test token with no value.`}
          </Text>
        </View>
        {venns.status === 'loading' ? <Text style={s.caption}>Checking for Venns…</Text> : null}
        {venns.status === 'error' ? <Note danger>{venns.error}</Note> : null}
        <View style={v.emptyActions}>
          <PillButton label="Create your first Venn" testID="create-venn-open" onPress={() => open('create')} />
          <PillButton
            label="Join with an invitation"
            testID="join-venn-open"
            secondary
            onPress={() => open('join')}
          />
          <PillButton label="Follow a Venn for a new key" secondary onPress={() => open('approve', { follow: '1' })} />
        </View>
      </View>
    );
  return (
    <View testID="venn-list">
      <FeeBalanceRow venns={venns} />
      {venns.venns.length ? <SectionTitle>Your Venns</SectionTitle> : null}
      {venns.venns.map(item => {
        const unit = unitFor(item.params);
        return (
          <Pressable
            key={item.saved.category}
            accessibilityRole="button"
            testID={`venn-${item.saved.category.slice(0, 8)}`}
            onPress={() => open('venn', { category: item.saved.category })}
            style={({ pressed }) => [s.assetCard, pressed ? s.pressed : null]}
          >
            <View style={s.vennMark}>
              <Users size={20} color={c.paper} />
            </View>
            <View style={s.fill}>
              <Text style={s.cardTitle}>{item.saved.name}</Text>
              <Text style={s.subtitle}>
                {TYPES[item.saved.type].title}
                {item.seat >= 0 && item.available > 0n ? ` · ${money(item.available, unit)} yours to spend` : ''}
              </Text>
            </View>
            <View style={v.rowAmount}>
              <Text style={s.assetAmount}>{amountOnly(item.balance, unit)}</Text>
              <Text style={v.rowUnit}>{unit}</Text>
            </View>
          </Pressable>
        );
      })}
      {venns.circles.length ? <SectionTitle>Your Circles</SectionTitle> : null}
      {venns.circles.map(item => (
        <CircleRow key={item.saved.category} view={item} onPress={() => open('circle', { category: item.saved.category })} />
      ))}
      {venns.proposals.length ? (
        <Text style={v.hint}>
          {venns.proposals.length} proposal{venns.proposals.length === 1 ? '' : 's'} you made {venns.proposals.length === 1 ? 'is' : 'are'} collecting approvals. Open its Venn to follow it.
        </Text>
      ) : null}
      {venns.preparing.length ? <SectionTitle>Plans</SectionTitle> : null}
      {venns.preparing.map(p => (
        <Pressable
          key={fingerprint(p.invite)}
          accessibilityRole="button"
          onPress={() => open('plan', { fingerprint: fingerprint(p.invite) })}
          style={({ pressed }) => [s.assetCard, pressed ? s.pressed : null]}
        >
          <View style={[s.vennMark, s.vennMarkPending]}>
            <Users size={20} color={c.ink} />
          </View>
          <View style={s.fill}>
            <Text style={s.cardTitle}>{p.invite.name}</Text>
            <Text style={s.subtitle}>{waitingText(p.invite.seats.length, p.accepted)}</Text>
          </View>
          <ChevronRight size={18} color={c.faint} />
        </Pressable>
      ))}
      {venns.status === 'error' ? <Note danger>{venns.error}</Note> : null}
      <View style={[s.buttonRow, v.listActions]}>
        <View style={s.fill}>
          <PillButton label="Create a Venn" testID="create-venn-open" onPress={() => open('create')} />
        </View>
        <View style={s.fill}>
          <PillButton label="Join" testID="join-venn-open" secondary onPress={() => open('join')} />
        </View>
      </View>
      <View style={v.actions}>
        <PillButton label="Approve a proposal" testID="approve-open" secondary onPress={() => open('approve')} />
      </View>
    </View>
  );
}

/** A plan waiting for everyone to accept, then creation. */
export function PlanScreen({
  venns,
  invite,
  openKey,
  onDeleted,
}: {
  venns: VennsState;
  invite: Invite;
  openKey(): void;
  onDeleted?(): void;
}) {
  const plan = venns.preparing.find(p => fingerprint(p.invite) === fingerprint(invite));
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [deposit, setDeposit] = useState('100.00');
  const [prepared, setPrepared] = useState<Awaited<ReturnType<VennsState['prepareCreate']>> | null>(null);
  const [notice, setNotice] = useState<{ text: string; danger?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!plan) return <Note>This plan was created or removed.</Note>;
  const seats = seatsOf(invite);
  const unit = unitFor(invite);
  const invitation = encodeInvite(invite);
  const waiting = invite.seats.map((seat, n) => ({
    name: seat.name,
    n,
    status: (n === 0 ? 'You' : plan.accepted.includes(n) ? 'Accepted' : 'Waiting') as SeatStatus,
  }));
  const others = waiting.length - 1;
  const acceptedCount = waiting.filter(w => w.status === 'Accepted').length;
  const stillWaiting = waiting.filter(w => w.status === 'Waiting');
  const ready = stillWaiting.length === 0;
  const supported = isVennAsset(invite);
  const NET = networkName(venns.network);
  const FEE = feeUnit(venns.network);
  let depositUnits = 0n;
  let depositError = '';
  if (deposit.trim()) {
    try {
      depositUnits = parseAssetAmount(deposit, venns.network);
    } catch (e) {
      depositError = errorText(e);
    }
  }
  if (!depositError && deposit.trim() && depositUnits <= 0n) depositError = 'Enter a deposit above zero.';
  if (!depositError && venns.keyTokens !== null && depositUnits > venns.keyTokens)
    depositError = `Your Venn key holds only ${money(venns.keyTokens, unit)}. Add more to it first.`;
  const act = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setNotice(null);
    try {
      await task();
    } catch (e) {
      setNotice({ text: errorText(e), danger: true });
    } finally {
      setBusy(false);
    }
  };
  const remove = () =>
    confirmAction({
      title: `Delete “${invite.name}”?`,
      message: acceptedCount
        ? `The ${acceptedCount} acceptance${acceptedCount === 1 ? '' : 's'} you collected will be lost. Everyone will have to accept a new invitation again.`
        : 'The invitation you shared will no longer lead anywhere. To start again you will need to send a new one.',
      cancel: 'Keep plan',
      action: 'Delete plan',
      destructive: true,
      onConfirm: () =>
        act(async () => {
          await venns.dropPlan(invite);
          onDeleted?.();
        }),
    });
  const preparingFeeCoin = prepared?.kind === 'feePreparation';
  return (
    <View testID="plan-screen">
      <Text accessibilityRole="header" style={v.screenTitle}>
        {invite.name}
      </Text>
      <Text style={s.body}>
        {TYPES[invite.type].title} · {invite.seats.length} people. Three steps to start it.
      </Text>

      <Step n={1} title="Share the invitation">
        <Text style={s.body}>
          Send it to each person. They open the Venns tab, tap Join, read the rules and accept their seat.
        </Text>
        <PillButton label="Share invitation" icon={Share2} onPress={() => shareText(invitation)} />
        <CodeCard value={invitation} label={`Invitation to ${invite.name}`} />
      </Step>

      <Step n={2} title="Collect acceptances" status={`${acceptedCount} of ${others}`}>
        <View style={s.detailCard}>
          {waiting.map((w, index) => (
            <React.Fragment key={w.n}>
              {index ? <View style={s.hairline} /> : null}
              <View
                accessible
                accessibilityLabel={
                  w.status === 'You'
                    ? `${w.name}${w.name.toLocaleLowerCase() === 'you' ? '' : ', you'}, organizer`
                    : `${w.name}, ${w.status}`
                }
                style={v.seatRow}
              >
                <Text style={[s.cardTitle, s.fill]}>
                  {w.name}
                  {w.n === 0 ? <Text style={s.subtitle}> · organizer</Text> : null}
                </Text>
                <StatusPill status={w.status} />
              </View>
            </React.Fragment>
          ))}
        </View>
        {ready ? (
          <Text style={s.body}>Everyone accepted. You can {invite.type === 'circle' ? 'start the Circle' : 'fund the Venn'} below.</Text>
        ) : (
          <>
            <Field
              label="Acceptance code"
              hint="Paste the code a member sent back after accepting their seat."
              error={codeError}
              testID="acceptance-input"
              value={code}
              onChangeText={text => {
                setCode(text);
                setCodeError('');
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <PillButton
              label="Add acceptance"
              secondary
              disabled={!code.trim() || busy}
              onPress={async () => {
                setBusy(true);
                setNotice(null);
                try {
                  const name = await venns.addAcceptance(code);
                  setCode('');
                  setNotice({ text: `${name} accepted.` });
                } catch (e) {
                  setCodeError(errorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </>
        )}
      </Step>

      <Step n={3} title={invite.type === 'circle' ? 'Start the Circle' : 'Fund the Venn'} status={ready ? undefined : 'Locked'}>
        {!supported ? (
          <Note>This plan uses a different asset. Create a {venns.asset.symbol} plan to continue.</Note>
        ) : !ready ? (
          <Text style={s.body}>
            Locked until everyone accepts, because the Venn is created with every member’s key. Still waiting for{' '}
            {stillWaiting.map(w => w.name).join(', ')}.
          </Text>
        ) : venns.pending ? (
          <>
            <Text style={s.body}>A Venn transaction is waiting for {NET}. Check it before funding.</Text>
            <PillButton label="Check pending transaction" disabled={busy} onPress={() => act(venns.checkPending)} />
          </>
        ) : prepared ? (
          <View>
            <Text accessibilityRole="header" style={v.reviewTitle}>
              {preparingFeeCoin ? 'Review fee coin' : prepared.kind === 'circle' ? 'Review the Circle' : 'Review first deposit'}
            </Text>
            {preparingFeeCoin ? (
              <Text style={[s.body, v.reviewIntro]}>
                Your Venn key needs a separate {FEE} coin to pay for the deposit. This moves {FEE} from
                your Venn key back to itself.
              </Text>
            ) : null}
            <View style={s.detailCard}>
              <DetailRow first stacked mono label="To" value={prepared.address} />
              {prepared.kind === 'feePreparation' ? (
                <>
                  <DetailRow label="Amount" value={sats(prepared.amountSatoshis)} />
                  <DetailRow label="Network fee" value={sats(prepared.fee)} />
                  <DetailRow total label="Total" value={sats(prepared.totalSatoshis)} />
                </>
              ) : prepared.kind === 'circle' ? (
                <>
                  <DetailRow label="Each round, everyone pays" value={money(prepared.circle.contribution, unit)} />
                  <DetailRow label="Network fee" value={sats(prepared.fee)} />
                  <DetailRow label="Member fees and contract coin" value={sats(prepared.spentSats - prepared.fee)} />
                  <DetailRow total label="Total" value={sats(prepared.spentSats)} />
                </>
              ) : (
                <>
                  <DetailRow label="Deposit" value={money(prepared.deposit, unit)} />
                  <DetailRow label="Network fee" value={sats(prepared.fee)} />
                  <DetailRow label="Member fees and contract coins" value={sats(prepared.spentSats - prepared.fee)} />
                  <DetailRow
                    total
                    label="Total"
                    value={`${money(prepared.deposit, unit)} + ${sats(prepared.spentSats)}`}
                  />
                </>
              )}
              <DetailRow label="Network" value={NET} />
            </View>
            {prepared.kind === 'deposit' ? (
              <Text style={v.hint}>
                The sats are {FEE} from your fee balance: the network fee, {sats(VENN_FEE_ALLOCATION)} for each
                invited member’s own fees, and the small coins the contract keeps.
              </Text>
            ) : null}
            <View style={v.actions}>
              <PillButton
                label={busy ? 'Submitting…' : preparingFeeCoin ? 'Prepare fee coin' : prepared.kind === 'circle' ? 'Start the Circle' : 'Create the Venn'}
                testID="venn-create"
                disabled={busy}
                onPress={() =>
                  act(async () => {
                    setPrepared(null);
                    await venns.create(prepared);
                    if (prepared.kind === 'feePreparation')
                      setNotice({ text: 'Fee coin prepared. Review the first deposit again.' });
                  })
                }
              />
              <PillButton label="Back" secondary disabled={busy} onPress={() => setPrepared(null)} />
            </View>
          </View>
        ) : invite.type === 'circle' ? (
          <View>
            <Text style={s.body}>
              Starting the Circle creates its contract on {NET}. No money moves yet: the first round begins now, and
              everyone pays their contribution from the Circle’s page.
            </Text>
            <Text style={v.hint}>
              You pay the network fee in {FEE} and give each member {sats(VENN_FEE_ALLOCATION)} for their own fees. Your fee
              balance is {venns.keyBalance === null ? 'unavailable' : sats(venns.keyBalance)}.
            </Text>
            <View style={v.actions}>
              <PillButton
                label={busy ? 'Preparing…' : 'Review the Circle'}
                disabled={busy}
                onPress={() => act(async () => setPrepared(await venns.prepareCreate(invite, 0n)))}
              />
              <PillButton label="Add money to your Venn key" secondary onPress={openKey} />
            </View>
          </View>
        ) : (
          <View>
            <Field
              label={`First deposit · ${unit}`}
              hint={`Your Venn key holds ${
                venns.keyTokens === null ? '…' : money(venns.keyTokens, unit)
              }.`}
              error={depositError}
              value={deposit}
              onChangeText={setDeposit}
              keyboardType="decimal-pad"
            />
            <Text style={v.hint}>
              You also pay the contract’s network costs in {FEE} and give each invited member{' '}
              {sats(VENN_FEE_ALLOCATION)} for their own fees. Your fee balance is{' '}
              {venns.keyBalance === null ? 'unavailable' : sats(venns.keyBalance)}.
            </Text>
            <View style={v.actions}>
              <PillButton
                label={busy ? 'Preparing…' : 'Review first deposit'}
                disabled={busy || depositUnits <= 0n || Boolean(depositError)}
                onPress={() => act(async () => setPrepared(await venns.prepareCreate(invite, depositUnits)))}
              />
              <PillButton label="Add money to your Venn key" secondary onPress={openKey} />
            </View>
          </View>
        )}
      </Step>

      {notice ? <Note danger={notice.danger}>{notice.text}</Note> : null}

      <SectionTitle>Rules everyone accepts</SectionTitle>
      {invite.type === 'circle' && invite.circle ? (
        <CircleTerms
          contribution={BigInt(invite.circle.contribution)}
          period={BigInt(invite.circle.period)}
          order={(invite.turns ?? []).map(n => invite.seats[n]?.name ?? `Seat ${n + 1}`)}
          unit={unitFor(invite)}
        />
      ) : (
        <Summary seats={seats} settings={invite.settings as unknown as Settings} unit={unit} />
      )}
      <View style={v.dangerZone}>
        <PillButton label="Delete this plan" secondary disabled={busy} onPress={remove} />
      </View>
    </View>
  );
}

/** Open an invitation, read it, accept a seat. */
export function JoinScreen({ venns, onDone }: { venns: VennsState; onDone?(): void }) {
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [seat, setSeat] = useState(-1);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (answer && invite)
    return (
      <View testID="join-accepted">
        <Text accessibilityRole="header" style={v.screenTitle}>
          Seat accepted
        </Text>
        <Text style={s.body}>
          Next, send this acceptance code back to {invite.seats[0].name}. When everyone has accepted, they fund and
          create {invite.name}, and it appears in your Venns tab.
        </Text>
        <View style={v.actions}>
          <PillButton label="Share acceptance code" icon={Share2} onPress={() => shareText(answer)} />
        </View>
        <CodeCard value={answer} label={`Your acceptance for ${invite.name}`} />
        {onDone ? (
          <View style={v.actions}>
            <PillButton label="Done" secondary onPress={onDone} />
          </View>
        ) : null}
      </View>
    );

  if (!invite)
    return (
      <View testID="join-screen">
        <Text style={[s.body, v.intro]}>
          Paste the invitation someone sent you. You’ll read the Venn’s rules and choose your seat before accepting
          anything.
        </Text>
        <Field
          label="Invitation code"
          hint="Paste the whole code you received in a message."
          error={error}
          testID="invite-input"
          value={code}
          onChangeText={text => {
            setCode(text);
            setError('');
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <PillButton
          label="Open invitation"
          disabled={!code.trim()}
          onPress={() => {
            try {
              setInvite(venns.openInvite(code.trim()));
              setSeat(-1);
              setError('');
            } catch (e) {
              setError(`This invitation can’t be opened: ${errorText(e)}`);
            }
          }}
        />
      </View>
    );

  const seats = seatsOf(invite);
  const unit = unitFor(invite);
  const type = TYPES[invite.type];
  const circle = invite.type === 'circle' && invite.circle;
  return (
    <View testID="join-review">
      <Text accessibilityRole="header" style={v.screenTitle}>
        {invite.name}
      </Text>
      <Text style={s.body}>Invited by {invite.seats[0].name}</Text>
      <View style={s.infoCard}>
        <Text style={s.cardTitle}>
          {type.title} · {type.line}
        </Text>
        <Text style={s.body}>{type.explain}</Text>
        <Text style={s.weakness}>Weakness: {type.weakness}</Text>
      </View>

      <SectionTitle>Which seat is yours?</SectionTitle>
      <View accessibilityRole="radiogroup">
        {seats.map((st, n) =>
          n === 0 ? null : (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityState={{ checked: seat === n }}
              accessibilityLabel={circle ? `${st.name}. Turn ${(invite.turns ?? []).indexOf(n) + 1}` : `${st.name}. ${roleNames(st.roles).join(', ')}. ${budgetText(st, unit)}`}
              onPress={() => setSeat(n)}
              style={({ pressed }) => [
                s.infoCard,
                v.seatOption,
                seat === n ? s.selectedCard : null,
                pressed ? s.pressed : null,
              ]}
            >
              <View style={[s.radio, seat === n ? s.radioSelected : null]}>
                {seat === n ? <View style={v.radioDot} /> : null}
              </View>
              <View style={s.fill}>
                <Text style={s.cardTitle}>{st.name}</Text>
                {circle ? (
                  <Text style={s.subtitle}>Turn {(invite.turns ?? []).indexOf(n) + 1} of {seats.length}</Text>
                ) : (
                  <>
                    <Text style={s.subtitle}>{roleNames(st.roles).join(', ') || 'no roles'}</Text>
                    <Text style={s.body}>{budgetText(st, unit)}</Text>
                  </>
                )}
              </View>
            </Pressable>
          ),
        )}
      </View>

      <SectionTitle>Rules</SectionTitle>
      {circle ? (
        <CircleTerms
          contribution={BigInt(circle.contribution)}
          period={BigInt(circle.period)}
          order={(invite.turns ?? []).map(n => invite.seats[n]?.name ?? `Seat ${n + 1}`)}
          unit={unitFor(invite)}
        />
      ) : (
        <>
          <Summary seats={seats} settings={invite.settings as unknown as Settings} unit={unit} />
          <Text style={v.hint}>
            Payments beyond a budget and rule changes are proposed by a member and approved by the others in the app.
          </Text>
        </>
      )}
      {error ? <Note danger>{error}</Note> : null}
      <View style={v.actions}>
        <PillButton
          label={busy ? 'Accepting…' : 'Accept my seat'}
          testID="accept-seat"
          disabled={seat < 1 || busy}
          onPress={async () => {
            setBusy(true);
            setError('');
            try {
              setAnswer(await venns.acceptInvite(invite, seat));
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        />
        {seat < 1 ? <Text style={v.hint}>Choose your seat above to accept.</Text> : null}
        <PillButton
          label="Use a different invitation"
          secondary
          disabled={busy}
          onPress={() => {
            setInvite(null);
            setSeat(-1);
            setError('');
          }}
        />
      </View>
    </View>
  );
}

function AllowanceCard({ seat, available, empty, unit }: { seat: Seat; available: bigint; empty: boolean; unit: string }) {
  if ((seat.roles & ROLE.SPEND) !== ROLE.SPEND || seat.budgetMode === BUDGET.NONE)
    return (
      <View style={s.infoCard}>
        <Text style={s.detailLabel}>Your spending</Text>
        <Text style={s.cardTitle}>No solo spending in this Venn</Text>
        <Text style={s.body}>
          Your seat has no budget, so payments go through a group vote. Propose one under Decisions below.
        </Text>
      </View>
    );
  const rule = budgetText(seat, unit);
  if (available > 0n)
    return (
      <View style={s.infoCard}>
        <Text style={s.detailLabel}>Yours to spend alone now</Text>
        <Text style={v.allowance}>{money(available, unit)}</Text>
        <Text style={s.subtitle}>{rule}</Text>
      </View>
    );
  return (
    <View style={s.infoCard}>
      <Text style={s.detailLabel}>Yours to spend alone now</Text>
      <Text style={v.allowance}>{money(0n, unit)}</Text>
      <Text style={s.body}>
        {empty
          ? `There is no ${unit} in this Venn right now. Anyone can add some with Receive (${lower(rule)}).`
          : `You’ve used your allowance. It refills over time (${lower(rule)}).`}
      </Text>
    </View>
  );
}

/** A Venn's page: money, your budget, the people, the rules. */
export function VennScreen({ view, venns }: { view: VennView; venns: VennsState }) {
  const [paying, setPaying] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [to, setTo] = useState('');
  const [toTouched, setToTouched] = useState(false);
  const [amount, setAmount] = useState('');
  const [prepared, setPrepared] = useState<Awaited<ReturnType<VennsState['prepareSpend']>> | null>(null);
  const [notice, setNotice] = useState<{ text: string; danger?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const cards = view.coins?.cards ?? [];
  const nameOf = (pkh: string, n: number) => view.saved.names[pkh] ?? `Member ${n + 1}`;
  const seats: Seat[] = cards.map((card, n) => ({ ...card.state, name: nameOf(card.state.pkh, n) }));
  const mine = view.seat >= 0 ? seats[view.seat] : undefined;
  const official = view.official.status === 'official';
  const supported = isVennAsset(view.params);
  const unit = unitFor(view.params);
  const NET = networkName(view.params.network);
  const FEE = feeUnit(view.params.network);
  const rules = view.coins?.rules.state;

  let units = 0n;
  let amountError = '';
  if (amount.trim()) {
    try {
      units = parseAssetAmount(amount, view.params.network);
    } catch (e) {
      amountError = errorText(e);
    }
    if (!amountError && units <= 0n) amountError = 'Enter an amount above zero.';
    if (!amountError && units > view.available)
      amountError = `That’s more than the ${money(view.available, unit)} you can spend alone right now.`;
  }
  let toError = '';
  if (toTouched && to.trim()) {
    try {
      tokenRecipient(to, view.params.network);
    } catch (e) {
      toError = errorText(e);
    }
  }

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setNotice(null);
    try {
      await task();
    } catch (e) {
      setNotice({ text: errorText(e), danger: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID="venn-screen">
      <View style={s.reviewHero}>
        <Text style={s.reviewAmount}>
          {supported
            ? formatAssetAmount(view.balance)
            : view.params.assetCategory
              ? view.balance.toString()
              : formatBch(view.balance)}
        </Text>
        <Text style={s.amountUnit}>
          {unit} in {view.saved.name}
        </Text>
      </View>
      <View
        accessible
        accessibilityRole="text"
        style={[v.badge, official ? v.badgeOfficial : v.badgeUnofficial]}
      >
        {official ? <BadgeCheck size={20} color={c.green} /> : <ShieldAlert size={20} color={c.danger} />}
        <View style={s.fill}>
          <Text style={[v.badgeTitle, official ? v.badgeTitleOfficial : s.dangerText]}>
            {official ? 'Official Venn contract' : 'Not an official Venn contract'}
          </Text>
          <Text style={official ? s.subtitle : [s.subtitle, s.dangerText]}>
            {view.official.status === 'official'
              ? `${view.official.name} v${view.official.version} · ${view.official.fingerprint}`
              : `${view.official.reason}. Do not add money.`}
          </Text>
        </View>
      </View>
      {view.official.status === 'official'
        ? view.official.warnings.map(w => <Note key={w}>{w}</Note>)
        : null}
      {!supported ? <Note>This Venn holds an older asset and is available for viewing.</Note> : null}
      {mine ? <AllowanceCard seat={mine} available={view.available} empty={view.balance === 0n} unit={unit} /> : null}

      {venns.pending ? (
        <View style={v.actions}>
          <PillButton
            label="Check pending transaction"
            disabled={busy}
            onPress={() =>
              run(async () => {
                await venns.checkPending();
                setNotice({ text: `The transaction is visible on ${NET}.` });
              })
            }
          />
        </View>
      ) : null}

      {supported && paying && !venns.pending ? (
        prepared ? (
          <View key="review" style={v.block}>
            <Text accessibilityRole="header" style={v.reviewTitle}>
              Review payment
            </Text>
            <View style={s.detailCard}>
              <DetailRow first stacked mono label="To" value={prepared.address} />
              <DetailRow label="Amount" value={money(prepared.amount, unit)} />
              <DetailRow label="Network fee" value={sats(prepared.fee)} />
              <DetailRow label="Token output" value={sats(prepared.carrierSats)} />
              <DetailRow
                total
                label="Total"
                value={`${money(prepared.amount, unit)} + ${sats(prepared.fee + prepared.carrierSats)}`}
              />
              <DetailRow label="Network" value={NET} />
            </View>
            <Text style={v.hint}>
              Paid from your allowance in {view.saved.name}. The network fee and token output are {FEE} from
              your fee balance; the token output is the small amount of {FEE} that travels with the {unit} to the
              recipient.
            </Text>
            <View style={v.actions}>
              <PillButton
                label={busy ? 'Sending…' : `Send ${money(prepared.amount, unit)}`}
                testID="venn-spend-confirm"
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  setNotice(null);
                  try {
                    await venns.sendPrepared(prepared);
                    setPaying(false);
                    setPrepared(null);
                    setTo('');
                    setAmount('');
                    setToTouched(false);
                    setNotice({ text: `Payment sent on ${NET}.` });
                  } catch (e) {
                    setNotice({ text: errorText(e), danger: true });
                    setPrepared(null);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <PillButton label="Back" secondary disabled={busy} onPress={() => setPrepared(null)} />
            </View>
          </View>
        ) : (
          <View key="form" style={v.block}>
            <SectionTitle>Pay from your allowance</SectionTitle>
            <FeeBalanceRow venns={venns} disabled={busy} />
            {venns.error ? <Note danger>{venns.error}</Note> : null}
            <Field
              label={`Recipient · token-aware ${NET} address`}
              hint={view.params.network === 'mainnet' ? 'Starts with bitcoincash:z or bitcoincash:r.' : 'Starts with bchtest:z or bchtest:r.'}
              error={toError}
              value={to}
              onChangeText={text => {
                setTo(text);
                setToTouched(false);
              }}
              onBlur={() => setToTouched(true)}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Field
              label={`Amount · ${unit}`}
              hint={`Up to ${money(view.available, unit)} right now.`}
              error={amountError}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
            <View style={v.actions}>
              <PillButton
                label={busy ? 'Preparing…' : 'Review payment'}
                disabled={busy || !to.trim() || units <= 0n || Boolean(amountError) || Boolean(toError)}
                onPress={() =>
                  run(async () => {
                    setToTouched(true);
                    setPrepared(await venns.prepareSpend(view, to, units));
                  })
                }
              />
              <PillButton label="Cancel" secondary disabled={busy} onPress={() => setPaying(false)} />
            </View>
          </View>
        )
      ) : supported && official ? (
        // Keyed so it mounts fresh after the review: reusing the review's native views left
        // Receive squashed on Android.
        <View key="actions" style={[s.buttonRow, v.actions]}>
          <View style={s.fill}>
            <PillButton
              label={receiving ? 'Hide address' : 'Receive'}
              secondary
              onPress={() => setReceiving(isOpen => !isOpen)}
            />
          </View>
          <View style={s.fill}>
            <PillButton
              label="Pay"
              testID="venn-pay"
              disabled={view.available <= 0n || Boolean(venns.pending)}
              onPress={() => {
                setReceiving(false);
                setPaying(true);
              }}
            />
          </View>
        </View>
      ) : null}

      {supported && receiving && !paying ? (
        <View style={v.block}>
          <Text style={s.body}>
            Anyone can add {unit} to {view.saved.name} on {NET} by sending to this token-aware address.
          </Text>
          <CodeCard value={view.address} label={`${unit} · ${NET}`} full />
          <PillButton label="Share address" icon={Share2} secondary onPress={() => shareText(view.address)} />
        </View>
      ) : null}
      {notice ? <Note danger={notice.danger}>{notice.text}</Note> : null}

      {supported && official ? <VennDecisions view={view} venns={venns} /> : null}

      <SectionTitle>People</SectionTitle>
      <View style={s.detailCard}>
        {seats.map((seat, n) => (
          <React.Fragment key={cards[n].state.pkh}>
            {n ? <View style={s.hairline} /> : null}
            <View style={v.member}>
              <Text style={s.cardTitle}>
                {seat.name}
                {n === view.seat ? <Text style={s.subtitle}> (you)</Text> : null}
              </Text>
              <Text style={s.subtitle}>{roleNames(seat.roles).join(' · ') || 'No roles'}</Text>
              <Text style={s.body}>{budgetText(seat, unit)}</Text>
              {cards[n].state.recovery ? (
                <Text style={s.weakness}>A recovery request is waiting on this seat.</Text>
              ) : null}
            </View>
          </React.Fragment>
        ))}
        {seats.length === 0 ? <Text style={[s.body, v.member]}>Members appear once the Venn is read from {NET}.</Text> : null}
      </View>

      {view.saved.turns ? (
        <>
          <SectionTitle>Turn order</SectionTitle>
          <View style={[s.detailCard, v.summaryCard]}>
            {view.saved.turns.map((seat, n) => (
              <Text key={n} style={s.body}>
                {n + 1}. {seats[seat]?.name ?? `Seat ${seat + 1}`}
              </Text>
            ))}
          </View>
        </>
      ) : null}

      {rules ? (
        <>
          <SectionTitle>Rules</SectionTitle>
          <Summary seats={seats} settings={rules} unit={unit} />
        </>
      ) : null}

      <Text style={[s.caption, v.addressLabel]}>Venn money address</Text>
      <Text selectable style={[s.caption, v.address]}>
        {view.address}
      </Text>
    </View>
  );
}

const v = StyleSheet.create({
  centered: { textAlign: 'center' },
  screenTitle: { fontSize: 24, fontWeight: '700', letterSpacing: -0.6, color: c.ink, marginBottom: 6 },
  intro: { marginBottom: 16 },
  sectionTitle: { marginTop: 24, marginBottom: 10 },
  summaryCard: { paddingVertical: 8 },
  emptyCard: {
    backgroundColor: c.paper,
    borderRadius: 24,
    padding: 24,
    gap: 10,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4, color: c.ink, textAlign: 'center', marginTop: 4 },
  emptyActions: { gap: 10, marginTop: 20 },
  listActions: { marginTop: 20 },
  feeSurface: { backgroundColor: c.paper, borderRadius: 16, overflow: 'hidden', marginBottom: 4 },
  rowAmount: { alignItems: 'flex-end' },
  rowUnit: { color: c.muted, fontSize: 12, marginTop: 2 },
  step: { marginTop: 28, gap: 12 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { color: c.paper, fontSize: 14, fontWeight: '700' },
  stepStatus: { color: c.muted, fontSize: 13, fontWeight: '600' },
  codeCard: { marginTop: 0 },
  seatRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 10 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 13, fontWeight: '600' },
  pillYou: { backgroundColor: c.tile },
  pillYouText: { color: c.ink },
  pillAccepted: { backgroundColor: c.mint },
  pillAcceptedText: { color: c.green },
  pillWaiting: { backgroundColor: c.warning },
  pillWaitingText: { color: c.warningInk },
  reviewTitle: { fontSize: 17, fontWeight: '600', color: c.ink, marginBottom: 10 },
  reviewIntro: { marginBottom: 10 },
  hint: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
  actions: { gap: 10, marginTop: 12 },
  dangerZone: { marginTop: 24 },
  seatOption: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.paper },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, marginBottom: 4 },
  badgeOfficial: { backgroundColor: c.mint },
  badgeUnofficial: { backgroundColor: c.paper, borderWidth: 1.5, borderColor: c.danger },
  badgeTitle: { fontSize: 15, fontWeight: '600' },
  badgeTitleOfficial: { color: c.green },
  allowance: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: c.ink, fontVariant: ['tabular-nums'] },
  block: { marginTop: 16 },
  member: { paddingVertical: 12, gap: 2 },
  addressLabel: { marginTop: 28 },
  address: { marginTop: 4 },
});
