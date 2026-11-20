// A Circle (jam'eya): the round, the pot, who has paid, whose turn it is, paying in and
// paying out. Everything here is enforced by the Circle contract on the Circle's network.
import React, { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { BadgeCheck, RefreshCw, Share2, ShieldAlert } from 'lucide-react-native';
import { styles as s } from '../ui/styles';
import { colors as c } from '../ui/theme';
import { DetailRow, Note, PillButton } from '../ui/kit';
import { formatSats } from '../ui/format';
import { vennAsset } from '../venn/asset';
import { hasPaid } from '../venn/circle';
import { TYPES } from '../venn/presets';
import { money } from '../venn/summary';
import type { CircleView, VennsState } from '../venn/useVenns';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const days = (seconds: bigint) => Number(seconds / 86_400n);
const when = (time: bigint) => new Date(Number(time) * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** The terms everyone accepts: contribution, round length and turn order. */
export function CircleTerms({ contribution, period, order, unit }: { contribution: bigint; period: bigint; order: string[]; unit: string }) {
  return (
    <View style={[s.detailCard, k.card]}>
      <Text style={s.body}>
        Each round, everyone pays {money(contribution, unit)}. The whole pot, {money(contribution * BigInt(order.length), unit)},
        goes to the member whose turn it is. A round lasts {days(period)} days.
      </Text>
      <Text style={s.body}>It pays out as soon as everyone has paid, or anyone can pay it out once the round’s deadline passes.</Text>
      {order.map((name, n) => (
        <Text key={n} style={s.body}>
          Turn {n + 1}: {name}
        </Text>
      ))}
      <Text style={s.weakness}>Weakness: {TYPES.circle.weakness}</Text>
    </View>
  );
}

/** A Circle in the Venns list. */
export function CircleRow({ view, onPress }: { view: CircleView; onPress(): void }) {
  const unit = vennAsset(view.params.network).symbol;
  const n = view.params.members.length;
  const round = view.state?.round ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [s.assetCard, pressed ? s.pressed : null]}
    >
      <View style={s.vennMark}>
        <RefreshCw size={20} color={c.paper} />
      </View>
      <View style={s.fill}>
        <Text style={s.cardTitle}>{view.saved.name}</Text>
        <Text style={s.subtitle}>
          Circle · {round >= n ? 'finished' : `round ${round + 1} of ${n}`}
          {view.seat >= 0 && view.state && round < n && !hasPaid(view.state.paid, view.seat) ? ' · your contribution is due' : ''}
        </Text>
      </View>
      <View style={k.rowAmount}>
        <Text style={s.assetAmount}>{money(view.pot, unit).replace(` ${unit}`, '')}</Text>
        <Text style={k.rowUnit}>{unit}</Text>
      </View>
    </Pressable>
  );
}

/** A Circle's own page. */
export function CircleScreen({ view, venns }: { view: CircleView; venns: VennsState }) {
  const unit = vennAsset(view.params.network).symbol;
  const [prepared, setPrepared] = useState<{ title: string; rows: [string, string][]; send(): Promise<unknown> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; danger?: boolean } | null>(null);
  const official = view.official.status === 'official';
  const n = view.params.members.length;
  const state = view.state;
  const nameOf = (pkh: string, i: number) => view.saved.names[pkh] || `Turn ${i + 1}`;
  const finished = !state || state.round >= n;
  const deadline = venns.deadlineOf(view);
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

  const contribute = (seat: number) =>
    run(async () => {
      const p = await venns.prepareContribute(view, seat);
      setPrepared({
        title: seat === view.seat ? 'Pay your contribution' : `Pay ${nameOf(view.params.members[seat], seat)}’s contribution`,
        rows: [
          ['Contribution', money(p.amount, unit)],
          ['Network fee', formatSats(p.fee)],
          ['Coin kept with it', formatSats(1000n)],
        ],
        send: () => venns.sendPrepared(p),
      });
    });
  const payout = () =>
    run(async () => {
      const p = await venns.preparePayout(view);
      setPrepared({
        title: `Pay the pot to ${nameOf(p.recipient, state!.round)}`,
        rows: [
          ['Pot', money(p.amount, unit)],
          ['To', p.address],
          ['Network fee', formatSats(p.fee)],
        ],
        send: () => venns.sendPrepared(p),
      });
    });

  return (
    <View testID="circle-screen">
      <View style={s.reviewHero}>
        <Text style={s.reviewAmount}>{money(view.pot, unit).replace(` ${unit}`, '')}</Text>
        <Text style={s.amountUnit}>
          {unit} in this round’s pot
        </Text>
      </View>
      <View style={[k.badge, official ? k.badgeOfficial : k.badgeUnofficial]}>
        {official ? <BadgeCheck size={20} color={c.green} /> : <ShieldAlert size={20} color={c.danger} />}
        <View style={s.fill}>
          <Text style={[k.badgeTitle, official ? k.badgeTitleOfficial : s.dangerText]}>
            {official ? 'Official Circle contract' : 'Not an official Circle contract'}
          </Text>
          <Text style={official ? s.subtitle : [s.subtitle, s.dangerText]}>
            {view.official.status === 'official'
              ? `Circle v1 · ${view.official.fingerprint}`
              : `${view.official.reason}. Do not pay in.`}
          </Text>
        </View>
      </View>

      {prepared ? (
        <View style={k.block}>
          <Text accessibilityRole="header" style={k.reviewTitle}>
            {prepared.title}
          </Text>
          <View style={s.detailCard}>
            {prepared.rows.map(([label, value], i) => (
              <DetailRow key={label} first={!i} stacked={label === 'To'} mono={label === 'To'} label={label} value={value} />
            ))}
            <DetailRow label="Network" value={view.params.network === 'mainnet' ? 'Mainnet' : 'Chipnet'} />
          </View>
          <View style={k.actions}>
            <PillButton
              label={busy ? 'Sending…' : 'Send'}
              disabled={busy}
              onPress={() =>
                run(async () => {
                  await prepared.send();
                  setPrepared(null);
                  setNotice({ text: `Sent on ${view.params.network === 'mainnet' ? 'Mainnet' : 'Chipnet'}.` });
                })
              }
            />
            <PillButton label="Back" secondary disabled={busy} onPress={() => setPrepared(null)} />
          </View>
        </View>
      ) : null}

      {!prepared && official && state ? (
        finished ? (
          <View style={k.block}>
            <Note>Every round has paid out. This Circle is finished; do not send it anything more.</Note>
            {view.coins?.money.length ? (
              <>
                <Text style={s.body}>
                  {money(view.pot, unit)} was left at the Circle. Anyone can send it to{' '}
                  {nameOf(view.params.members[n - 1], n - 1)}, the last member in the order.
                </Text>
                <PillButton
                  label="Send what’s left"
                  secondary
                  disabled={busy || Boolean(venns.pending)}
                  onPress={() =>
                    run(async () => {
                      const p = await venns.prepareSweep(view);
                      setPrepared({
                        title: `Send what’s left to ${nameOf(p.recipient, n - 1)}`,
                        rows: [
                          ['Amount', money(p.amount, unit)],
                          ['To', p.address],
                          ['Network fee', formatSats(p.fee)],
                        ],
                        send: () => venns.sendPrepared(p),
                      });
                    })
                  }
                />
              </>
            ) : null}
          </View>
        ) : (
          <View style={k.block}>
            <View style={s.detailCard}>
              <DetailRow first label="Round" value={`${state.round + 1} of ${n}`} />
              <DetailRow label="This round goes to" value={nameOf(view.params.members[state.round], state.round)} />
              <DetailRow label="Paid this round" value={`${view.params.members.filter((_, i) => hasPaid(state.paid, i)).length} of ${n}`} />
              {deadline ? <DetailRow label="Deadline" value={when(deadline)} /> : null}
            </View>
            {view.seat >= 0 && !hasPaid(state.paid, view.seat) ? (
              <PillButton
                label={`Pay my ${money(view.params.contribution, unit)}`}
                disabled={busy || Boolean(venns.pending)}
                onPress={() => contribute(view.seat)}
              />
            ) : view.seat >= 0 ? (
              <Text style={s.body}>You’ve paid this round.</Text>
            ) : null}
            <PillButton
              label={view.readyAt === 0n ? 'Pay out the pot now' : 'Pay out after the deadline'}
              secondary
              disabled={busy || Boolean(venns.pending)}
              onPress={payout}
            />
            {view.readyAt !== 0n ? (
              <Text style={k.hint}>
                Not everyone has paid. After the deadline anyone can pay out what is in the pot; whoever has not paid is
                recorded as having missed this round.
              </Text>
            ) : null}
          </View>
        )
      ) : null}
      {venns.pending ? (
        <PillButton label="Check pending transaction" disabled={busy} onPress={() => run(venns.checkPending)} />
      ) : null}
      {notice ? <Note danger={notice.danger}>{notice.text}</Note> : null}

      <Text accessibilityRole="header" style={[s.sectionTitle, k.title]}>
        Turns
      </Text>
      <View style={s.detailCard}>
        {view.params.members.map((pkh, i) => {
          const paid = state ? hasPaid(state.paid, i) : false;
          const missed = state ? hasPaid(state.missed, i) : false;
          const received = state ? i < state.round : false;
          return (
            <React.Fragment key={pkh}>
              {i ? <View style={s.hairline} /> : null}
              <View style={k.member}>
                <Text style={s.cardTitle}>
                  {i + 1}. {nameOf(pkh, i)}
                  {i === view.seat ? <Text style={s.subtitle}> (you)</Text> : null}
                </Text>
                <Text style={s.subtitle}>
                  {[received ? 'received the pot' : state && i === state.round ? 'this round' : 'waiting for their turn',
                    !finished ? (paid ? 'paid this round' : 'not paid yet') : '',
                    missed ? 'missed a round before' : ''].filter(Boolean).join(' · ')}
                </Text>
                {!finished && !paid && i !== view.seat && official ? (
                  <Pressable accessibilityRole="button" onPress={() => contribute(i)} hitSlop={8}>
                    <Text style={k.link}>Pay it for them</Text>
                  </Pressable>
                ) : null}
              </View>
            </React.Fragment>
          );
        })}
      </View>

      <Text accessibilityRole="header" style={[s.sectionTitle, k.title]}>
        Rules
      </Text>
      <CircleTerms
        contribution={view.params.contribution}
        period={view.params.period}
        order={view.params.members.map((pkh, i) => nameOf(pkh, i))}
        unit={unit}
      />
      <Text style={[s.caption, k.title]}>Contributions are paid to</Text>
      <Text selectable style={s.caption}>
        {view.address}
      </Text>
      <View style={k.actions}>
        <PillButton label="Share contribution address" icon={Share2} secondary onPress={() => Share.share({ message: view.address }).catch(() => undefined)} />
      </View>
    </View>
  );
}

const k = StyleSheet.create({
  card: { paddingVertical: 12, gap: 6 },
  rowAmount: { alignItems: 'flex-end' },
  rowUnit: { color: c.muted, fontSize: 12, marginTop: 2 },
  block: { marginTop: 16, gap: 10 },
  actions: { gap: 10, marginTop: 12 },
  reviewTitle: { fontSize: 17, fontWeight: '600', color: c.ink, marginBottom: 10 },
  hint: { color: c.muted, fontSize: 13, lineHeight: 19 },
  title: { marginTop: 24, marginBottom: 10 },
  member: { paddingVertical: 12, gap: 2 },
  link: { color: c.green, fontWeight: '600', marginTop: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, marginBottom: 4 },
  badgeOfficial: { backgroundColor: c.mint },
  badgeUnofficial: { backgroundColor: c.paper, borderWidth: 1.5, borderColor: c.danger },
  badgeTitle: { fontSize: 15, fontWeight: '600' },
  badgeTitleOfficial: { color: c.green },
});
