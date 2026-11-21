// Group decisions on a Venn's page: propose a payment, a member, a budget or a rule; collect
// approval codes; send. And recovery: help a member who lost their phone, stop a request, or
// take a seat back with a new key.
import React, { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { Share2 } from 'lucide-react-native';
import { styles as s } from '../ui/styles';
import { colors as c } from '../ui/theme';
import { Chip, DetailRow, Field, Note, PillButton, SafeQR } from '../ui/kit';
import { Choice, Toggle } from '../ui/Choice';
import { confirmAction } from '../ui/confirm';
import { formatSats } from '../ui/format';
import { parseAssetAmount, tokenRecipient, vennAsset } from '../venn/asset';
import type { MemberSpec, VoteChange } from '../venn/build';
import { BUDGET, ROLE, RULE, STOP, type RulesState } from '../venn/layout';
import { DAY } from '../venn/presets';
import { decodeKeyCode, pkhOfKey } from '../venn/proposal';
import { money } from '../venn/summary';
import type { ProposalView, VennView, VennsState } from '../venn/useVenns';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const shareText = (message: string) => {
  Share.share({ message }).catch(() => undefined);
};

type Kind = 'pay' | 'add' | 'remove' | 'budget' | 'rule';
const KINDS: { value: Kind; label: string; weakness?: string }[] = [
  { value: 'pay', label: 'Pay from the Venn' },
  { value: 'add', label: 'Add a member' },
  { value: 'remove', label: 'Remove a member' },
  { value: 'budget', label: 'Change someone’s budget' },
  { value: 'rule', label: 'Change a voting rule' },
];
const RULE_KEYS: { value: keyof RulesState; label: string }[] = [
  { value: 'payments', label: 'Payments beyond a budget' },
  { value: 'membership', label: 'Adding or removing members' },
  { value: 'spending', label: 'Changing budgets' },
  { value: 'recoveryRule', label: 'Changing recovery' },
  { value: 'governance', label: 'Changing these rules' },
];
const RULE_VALUES = [
  { value: RULE.LOCKED, label: 'Locked', weakness: 'Can never change again.' },
  { value: RULE.MAJORITY, label: 'Majority', weakness: 'More than half of the voters can act against the others.' },
  { value: RULE.EVERYONE, label: 'Everyone', weakness: 'One lost phone freezes it, unless recovery replaces that key.' },
];

/** One reviewed transaction, ready to send. */
const networkName = (n: 'chipnet' | 'mainnet') => (n === 'mainnet' ? 'Mainnet' : 'Chipnet');

function Review({
  title,
  rows,
  busy,
  onSend,
  onBack,
  network,
}: {
  title: string;
  rows: [string, string][];
  busy: boolean;
  network: 'chipnet' | 'mainnet';
  onSend(): void;
  onBack(): void;
}) {
  return (
    <View style={d.block}>
      <Text accessibilityRole="header" style={d.reviewTitle}>
        {title}
      </Text>
      <View style={s.detailCard}>
        {rows.map(([label, value], n) => (
          <DetailRow key={label} first={!n} label={label} value={value} />
        ))}
        <DetailRow label="Network" value={networkName(network)} />
      </View>
      <View style={d.actions}>
        <PillButton label={busy ? 'Sending…' : 'Send'} disabled={busy} onPress={onSend} />
        <PillButton label="Back" secondary disabled={busy} onPress={onBack} />
      </View>
    </View>
  );
}

function Code({ value, label }: { value: string; label: string }) {
  return (
    <View style={[s.receiveCard, d.code]}>
      <View style={s.qr}>
        <SafeQR value={value} />
      </View>
      <Text style={[s.cardEyebrow, s.receiveCaption]}>{label}</Text>
      <Text selectable numberOfLines={3} style={s.address}>
        {value}
      </Text>
    </View>
  );
}

/** A proposal this wallet made: approvals so far, the code to share, and sending it. */
function ProposalCard({ p, view, venns }: { p: ProposalView; view: VennView; venns: VennsState }) {
  const [approval, setApproval] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<Awaited<ReturnType<VennsState['prepareProposal']>> | null>(null);
  const names = p.saved.approvals.map(a => view.saved.names[pkhOfKey(a.publicKey)] ?? 'A member');
  const ready = p.saved.approvals.length >= p.need;
  if (prepared)
    return (
      <Review
        network={view.params.network}
        title={`Send: ${prepared.title}`}
        rows={[
          ['Approvals', `${p.saved.approvals.length} of ${p.need} needed`],
          ['Network fee', formatSats(prepared.fee)],
        ]}
        busy={busy}
        onBack={() => setPrepared(null)}
        onSend={async () => {
          setBusy(true);
          setError('');
          try {
            await venns.sendProposal(prepared);
          } catch (e) {
            setError(errorText(e));
            setPrepared(null);
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  return (
    <View style={[s.detailCard, d.proposal]}>
      <Text style={s.cardTitle}>{p.saved.title}</Text>
      <Text style={s.subtitle}>
        {p.saved.approvals.length} of {p.need} approvals{names.length ? `: ${names.join(', ')}` : ''}
      </Text>
      {!ready ? (
        <>
          <Text style={s.body}>Share this proposal with the others. Each one who agrees sends back an approval code.</Text>
          <PillButton label="Share proposal" icon={Share2} secondary onPress={() => shareText(p.saved.code)} />
          <Code value={p.saved.code} label={p.saved.title} />
          <Field
            label="Approval code"
            hint="Paste a code someone sent back."
            error={error}
            value={approval}
            onChangeText={t => {
              setApproval(t);
              setError('');
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <PillButton
            label="Add approval"
            secondary
            disabled={!approval.trim() || busy}
            onPress={async () => {
              setBusy(true);
              try {
                const name = await venns.addApproval(approval);
                setApproval('');
                setNotice(`${name} approved.`);
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      ) : (
        <PillButton
          label="Review and send"
          disabled={busy || Boolean(venns.pending)}
          onPress={async () => {
            setBusy(true);
            setError('');
            try {
              setPrepared(await venns.prepareProposal(p.saved.id));
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {notice ? <Note>{notice}</Note> : null}
      {ready && error ? <Note danger>{error}</Note> : null}
      <Chip
        label="Delete proposal"
        onPress={() =>
          confirmAction({
            title: 'Delete this proposal?',
            message: 'Approvals collected for it are lost. Nothing has been sent.',
            cancel: 'Keep',
            action: 'Delete',
            destructive: true,
            onConfirm: () => venns.dropProposal(p.saved.id),
          })
        }
      />
    </View>
  );
}

/** The form for a new proposal. */
function Propose({ view, venns, onDone }: { view: VennView; venns: VennsState; onDone(): void }) {
  const network = view.params.network;
  const unit = vennAsset(network).symbol;
  const coins = view.coins!;
  const rules = coins.rules.state;
  const cards = coins.cards;
  const nameOf = (pkh: string, n: number) => view.saved.names[pkh] ?? `Member ${n + 1}`;
  const [kind, setKind] = useState<Kind>('pay');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [keyCode, setKeyCode] = useState('');
  const [name, setName] = useState('');
  const [votes, setVotes] = useState(true);
  const [helps, setHelps] = useState(true);
  const [spends, setSpends] = useState(false);
  const [who, setWho] = useState(cards[0]?.state.pkh ?? '');
  const [ruleKey, setRuleKey] = useState<keyof RulesState>('payments');
  const [ruleValue, setRuleValue] = useState<number>(rules.payments);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const build = (): { change: VoteChange; title: string; names?: Record<string, string> } => {
    const daily = (text: string) => {
      const units = parseAssetAmount(text, network);
      if (units <= 0n) throw new Error('Enter an amount above zero.');
      return units;
    };
    const whoName = nameOf(who, cards.findIndex(c => c.state.pkh === who));
    if (kind === 'pay') {
      const units = daily(amount);
      return { change: { payments: [{ to: tokenRecipient(to, network), amount: units }] }, title: `Pay ${money(units, unit)}` };
    }
    if (kind === 'add') {
      const { publicKey } = decodeKeyCode(keyCode);
      if (!name.trim()) throw new Error('Give the new member a name everyone recognises.');
      const roles = (votes ? ROLE.VOTE : 0) | (helps ? ROLE.HELPER : 0) | (spends ? ROLE.SPEND : 0);
      const spec: MemberSpec = spends
        ? { publicKey, roles, budgetMode: BUDGET.REFILL, budget: daily(amount), period: DAY, cap: 0n }
        : { publicKey, roles, budgetMode: BUDGET.NONE, budget: 0n, period: 0n, cap: 0n };
      return { change: { add: [spec] }, title: `Add ${name.trim()}`, names: { [pkhOfKey(publicKey)]: name.trim() } };
    }
    if (kind === 'remove') return { change: { remove: [who] }, title: `Remove ${whoName}` };
    if (kind === 'budget') {
      const card = cards.find(c => c.state.pkh === who)!.state;
      if (!amount.trim() || parseAssetAmount(amount, network) === 0n)
        return {
          change: { update: [{ pkh: who, roles: card.roles & ~ROLE.SPEND, budgetMode: BUDGET.NONE, budget: 0n, period: 0n, cap: 0n }] },
          title: `Remove ${whoName}’s budget`,
        };
      const units = daily(amount);
      return {
        change: { update: [{ pkh: who, roles: card.roles | ROLE.SPEND, budgetMode: BUDGET.REFILL, budget: units, period: DAY, cap: card.cap }] },
        title: `Give ${whoName} ${money(units, unit)} a day`,
      };
    }
    const label = RULE_KEYS.find(r => r.value === ruleKey)!.label;
    return {
      change: { settings: { [ruleKey]: ruleValue } },
      title: `${label}: ${RULE_VALUES.find(r => r.value === ruleValue)!.label.toLowerCase()}`,
    };
  };

  return (
    <View style={d.block}>
      <Choice title="What do you propose?" value={kind} onChange={k => { setKind(k); setError(''); }} options={KINDS} />
      {kind === 'pay' ? (
        <>
          <Field label={`Recipient · token-aware ${networkName(network)} address`} value={to} onChangeText={setTo} autoCapitalize="none" autoCorrect={false} />
          <Field label={`Amount · ${unit}`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        </>
      ) : null}
      {kind === 'add' ? (
        <>
          <Field
            label="Their Venn key code"
            hint="They open Wallet → their Venn key and send you the code from Share my Venn key code."
            value={keyCode}
            onChangeText={setKeyCode}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field label="Their name" value={name} onChangeText={setName} maxLength={40} />
          <View style={s.detailCard}>
            <Toggle label="Votes" detail="Counts toward every vote." value={votes} onChange={setVotes} />
            <Toggle label="Helps recover lost keys" detail="Enough helpers together can take over a seat after the wait." value={helps} onChange={setHelps} />
            <Toggle label="Spends alone" detail="Can spend their whole budget at once; it refills daily." value={spends} onChange={setSpends} />
          </View>
          {spends ? <Field label={`Daily budget · ${unit}`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /> : null}
        </>
      ) : null}
      {kind === 'remove' || kind === 'budget' ? (
        <Choice
          title="Who?"
          value={who}
          onChange={setWho}
          options={cards.map((card, n) => ({ value: card.state.pkh, label: nameOf(card.state.pkh, n) }))}
        />
      ) : null}
      {kind === 'budget' ? (
        <Field
          label={`New daily budget · ${unit}`}
          hint="Leave empty or 0 to remove their budget; they then pay only through votes."
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />
      ) : null}
      {kind === 'rule' ? (
        <>
          <Choice
            title="Which rule?"
            value={ruleKey}
            onChange={key => {
              setRuleKey(key);
              setRuleValue(rules[key] as number);
            }}
            options={RULE_KEYS}
          />
          <Choice
            title="Needs"
            value={ruleValue}
            onChange={setRuleValue}
            options={(ruleKey === 'payments' ? RULE_VALUES.slice(1) : RULE_VALUES).map(o =>
              o.value === ruleValue ? o : { ...o, detail: o.weakness },
            )}
          />
        </>
      ) : null}
      {error ? <Note danger>{error}</Note> : null}
      <View style={d.actions}>
        <PillButton
          label={busy ? 'Preparing…' : 'Create proposal'}
          disabled={busy || Boolean(venns.pending)}
          onPress={async () => {
            setBusy(true);
            setError('');
            try {
              const { change, title, names } = build();
              await venns.proposeVote(view, change, title, names);
              onDone();
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        />
        <PillButton label="Cancel" secondary disabled={busy} onPress={onDone} />
      </View>
    </View>
  );
}

/** Recovery on this Venn: requests waiting, stopping them, starting one, taking a seat back. */
function Recovery({ view, venns }: { view: VennView; venns: VennsState }) {
  const coins = view.coins!;
  const rules = coins.rules.state;
  const cards = coins.cards;
  const nameOf = (pkh: string, n: number) => view.saved.names[pkh] ?? `Member ${n + 1}`;
  const mine = view.seat >= 0 ? cards[view.seat].state : null;
  const [helping, setHelping] = useState(false);
  const [target, setTarget] = useState('');
  const [newKey, setNewKey] = useState('');
  const [strong, setStrong] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<{ title: string; tx: unknown; fee: bigint; send(): Promise<unknown> } | null>(null);

  const act = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const pendingCards = cards.map((card, n) => ({ card, n })).filter(x => x.card.state.recovery !== 0);
  const voter = mine ? (mine.roles & ROLE.VOTE) === ROLE.VOTE && mine.recovery === 0 : false;
  const helper = mine ? (mine.roles & ROLE.HELPER) === ROLE.HELPER && mine.recovery === 0 : false;
  const hours = (units: number) => Math.max(1, Math.round((units * 512) / 3600));

  if (prepared)
    return (
      <Review
        network={view.params.network}
        title={prepared.title}
        rows={[['Network fee', formatSats(prepared.fee)]]}
        busy={busy}
        onBack={() => setPrepared(null)}
        onSend={() =>
          act(async () => {
            await prepared.send();
            setPrepared(null);
            setNotice(`Sent on ${networkName(view.params.network)}.`);
          })
        }
      />
    );

  return (
    <View>
      {view.incoming >= 0 ? (
        <View style={[s.infoCard, d.gap]}>
          <Text style={s.cardTitle}>This wallet’s key is taking over {nameOf(cards[view.incoming].state.pkh, view.incoming)}’s seat</Text>
          <Text style={s.body}>
            The helpers approved it. After about {hours(cards[view.incoming].state.waitUnits)} hours from when their request
            confirmed, you can finish it here.
          </Text>
          <PillButton
            label="Take over the seat"
            disabled={busy || Boolean(venns.pending)}
            onPress={() =>
              act(async () => {
                const p = await venns.prepareCompleteRecovery(view);
                setPrepared({ title: 'Take over the seat', tx: p.tx, fee: p.fee, send: () => venns.sendPrepared(p) });
              })
            }
          />
        </View>
      ) : null}

      {pendingCards.map(({ card, n }) => {
        const isMine = n === view.seat;
        return (
          <View key={card.state.pkh} style={[s.infoCard, d.gap]}>
            <Text style={s.cardTitle}>
              {isMine ? 'Someone asked to give your seat a new key' : `A recovery is waiting on ${nameOf(card.state.pkh, n)}’s seat`}
            </Text>
            <Text style={s.body}>
              New key {card.state.newPkh.slice(0, 8)}… takes over about {hours(card.state.waitUnits)} hours after the request
              confirmed. Until then the seat cannot spend or vote.
            </Text>
            {isMine && card.state.recovery === 1 ? (
              <PillButton
                label="Stop it with my key"
                disabled={busy || Boolean(venns.pending)}
                onPress={() =>
                  act(async () => {
                    const p = await venns.prepareStopByKey(view);
                    setPrepared({ title: 'Stop the recovery request', tx: p.tx, fee: p.fee, send: () => venns.sendPrepared(p) });
                  })
                }
              />
            ) : null}
            {isMine && card.state.recovery === 2 ? (
              <Text style={s.weakness}>Under this Venn’s rules your key cannot stop it. Ask the voters to stop it.</Text>
            ) : null}
            {!isMine && voter && rules.stopRule !== STOP.KEY ? (
              <PillButton
                label="Propose stopping it"
                secondary
                disabled={busy || Boolean(venns.pending)}
                onPress={() =>
                  act(async () => {
                    await venns.proposeStopRecovery(view, card.state.pkh);
                    setNotice('Proposal created. Share it with the other voters above.');
                  })
                }
              />
            ) : null}
          </View>
        );
      })}

      {rules.recoveryOn && helper ? (
        helping ? (
          <View style={d.block}>
            <Choice
              title="Whose phone was lost?"
              value={target}
              onChange={setTarget}
              options={cards
                .map((card, n) => ({ card, n }))
                .filter(x => x.n !== view.seat && x.card.state.recovery === 0)
                .map(x => ({ value: x.card.state.pkh, label: nameOf(x.card.state.pkh, x.n) }))}
            />
            <Field
              label="Their new Venn key code"
              hint="They install Venn on the new phone, open Wallet → their Venn key, and send you its key code."
              value={newKey}
              onChangeText={setNewKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {rules.stopRule === STOP.BOTH ? (
              <View style={s.detailCard}>
                <Toggle
                  label="Use the stronger path"
                  detail={`Needs ${rules.strongNeeded} helpers and a longer wait, and their old key cannot stop it. Use it only if the old key may be stolen.`}
                  value={strong}
                  onChange={setStrong}
                />
              </View>
            ) : null}
            <View style={d.actions}>
              <PillButton
                label={busy ? 'Preparing…' : 'Create recovery proposal'}
                disabled={busy || !target || !newKey.trim() || Boolean(venns.pending)}
                onPress={() =>
                  act(async () => {
                    const { publicKey } = decodeKeyCode(newKey);
                    await venns.proposeRecovery(view, target, publicKey, strong);
                    setHelping(false);
                    setNewKey('');
                    setNotice('Proposal created. Share it with the other helpers above, and send the Venn code below to the new phone.');
                  })
                }
              />
              <PillButton label="Cancel" secondary disabled={busy} onPress={() => setHelping(false)} />
            </View>
          </View>
        ) : (
          <PillButton label="Help someone who lost their phone" secondary onPress={() => setHelping(true)} />
        )
      ) : null}
      <View style={d.block}>
        <Text style={s.body}>
          Someone you add by vote opens Join a Venn and pastes this Venn’s code to see their seat.
          {rules.recoveryOn ? ' A member on a new phone follows it the same way to finish taking their seat back.' : ''}
        </Text>
        <PillButton label="Share Venn code" icon={Share2} secondary onPress={() => shareText(venns.vennCode(view))} />
      </View>
      {rules.recoveryOn ? null : <Text style={s.weakness}>Recovery is off in this Venn: a lost key loses that seat.</Text>}
      {error ? <Note danger>{error}</Note> : null}
      {notice ? <Note>{notice}</Note> : null}
    </View>
  );
}

/** Decisions and recovery for a Venn this wallet can act in. */
export function VennDecisions({ view, venns }: { view: VennView; venns: VennsState }) {
  const [proposing, setProposing] = useState(false);
  if (!view.coins) return null;
  const mine = venns.proposals.filter(p => p.saved.category === view.saved.category);
  const member = view.seat >= 0;
  return (
    <View>
      <Text accessibilityRole="header" style={[s.sectionTitle, d.title]}>
        Decisions
      </Text>
      <Text style={s.body}>
        Payments beyond a budget, members, budgets and rules change by vote. One member proposes; the others approve with
        their own phones.
      </Text>
      {mine.map(p => (
        <ProposalCard key={p.saved.id} p={p} view={view} venns={venns} />
      ))}
      {member ? (
        proposing ? (
          <Propose view={view} venns={venns} onDone={() => setProposing(false)} />
        ) : (
          <View style={d.actions}>
            <PillButton label="Propose a change" testID="venn-propose" onPress={() => setProposing(true)} />
          </View>
        )
      ) : null}
      <Text accessibilityRole="header" style={[s.sectionTitle, d.title]}>
        Lost phones
      </Text>
      <Recovery view={view} venns={venns} />
      <Text style={[s.caption, d.fee]}>Your fee balance pays the network fee for anything you send: {venns.keyBalance === null ? '…' : formatSats(venns.keyBalance)}.</Text>
    </View>
  );
}

const d = StyleSheet.create({
  title: { marginTop: 24, marginBottom: 10 },
  block: { marginTop: 12, gap: 10 },
  actions: { gap: 10, marginTop: 12 },
  reviewTitle: { fontSize: 17, fontWeight: '600', color: c.ink, marginBottom: 10 },
  proposal: { marginTop: 12, gap: 10, paddingVertical: 14 },
  code: { marginTop: 0 },
  gap: { marginTop: 12, gap: 8 },
  fee: { marginTop: 16 },
});
