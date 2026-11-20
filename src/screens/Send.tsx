import React, { useEffect, useRef, useState } from 'react';
import { NETWORKS, type PaymentReview } from 'react-native-xo';
import type { WalletState } from '../wallet/useWallet';
import { Keyboard, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, Delete } from 'lucide-react-native';
import { colors as c } from '../ui/theme';
import { styles as s } from '../ui/styles';
import { pressKey } from '../ui/format';
import { Amount, Chip, DetailRow, Note, PillButton } from '../ui/kit';

const unitFor = (network: string) => (network === 'chipnet' ? 'tBCH' : 'BCH');

/** Wallet errors say "BCH"; on Chipnet show them in the same tBCH unit as the rest of the screen. */
const inUnit = (message: string, unit: string) => (unit === 'BCH' ? message : message.replace(/\bBCH\b/g, unit));

const KEY_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'delete'],
];
const KEY_LABELS = { '.': 'Decimal point', delete: 'Delete' };

function Keypad({ amount, onChange, disabled }) {
  return (
    <View style={s.keypad}>
      {KEY_ROWS.map(row => (
        <View key={row[0]} style={s.keypadRow}>
          {row.map(key => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={KEY_LABELS[key] || key}
              testID={`key-${key === '.' ? 'dot' : key}`}
              disabled={disabled}
              onPress={() => {
                Keyboard.dismiss();
                onChange(pressKey(amount, key));
              }}
              onLongPress={key === 'delete' ? () => onChange('') : undefined}
              style={({ pressed }) => [s.key, pressed ? s.keyPressed : null]}
            >
              {key === 'delete' ? (
                <Delete size={26} color={c.ink} strokeWidth={1.8} />
              ) : (
                <Text style={s.keyText}>{key}</Text>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

export function SendScreen({
  balance,
  network,
  config,
  busy,
  pending,
  notice,
  recipient,
  setRecipient,
  amount,
  setAmount,
  prepare,
  approver,
}) {
  const unit = unitFor(network);
  const ready = Boolean(recipient.trim()) && Boolean(amount);
  return (
    <View testID="send-screen">
      <Text testID="send-scope" style={local.scope}>
        {approver
          ? `Sends ${unit} from ${approver}, which approves each payment.`
          : network === 'chipnet'
            ? 'Sends tBCH from your wallet. Venn Test USD is paid from a Venn’s page on the Venns tab.'
            : 'Sends BCH from your wallet.'}
      </Text>
      <View style={s.recipientField}>
        <Text style={s.recipientLabel}>To · {config.label} address</Text>
        <TextInput
          testID="recipient-input"
          accessibilityLabel={`Recipient ${config.label} address`}
          accessibilityHint={`Paste the full ${config.prefix} address to send ${unit} to.`}
          value={recipient}
          onChangeText={setRecipient}
          placeholder={`${config.prefix}:…`}
          placeholderTextColor={c.faint}
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          multiline
          submitBehavior="blurAndSubmit"
          returnKeyType="done"
          style={s.recipientInput}
        />
      </View>
      <View style={s.amountBlock}>
        <Text
          testID="amount-input"
          accessibilityRole="text"
          accessibilityLabel={`Amount, ${amount || '0'} ${unit}`}
          accessibilityLiveRegion="polite"
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[s.amountEntry, amount ? null : s.amountPlaceholder]}
        >
          {amount || '0'}
        </Text>
        <Text style={s.amountUnit}>{unit}</Text>
        {notice ? (
          <Text testID="wallet-error" accessibilityLiveRegion="polite" style={s.amountError}>
            {inUnit(notice, unit)}
          </Text>
        ) : null}
      </View>
      <Text style={s.available}>
        {balance ? balance.balanceBch : '—'} {unit} available in your wallet
      </Text>
      <Keypad amount={amount} onChange={setAmount} disabled={busy} />
      <PillButton
        label={busy ? (approver ? `Approve in ${approver}…` : 'Preparing…') : 'Review payment'}
        testID="review-payment"
        disabled={busy || Boolean(pending) || !ready}
        onPress={prepare}
      />
      {pending ? (
        <Text style={s.caption}>A payment needs checking. Check its status on Wallet before sending again.</Text>
      ) : null}
    </View>
  );
}

export function ReviewScreen({ review, network, config, busy, send, cancel }) {
  const unit = unitFor(network);
  const mainnet = network === 'mainnet';
  return (
    <View testID="review-screen">
      <View
        accessible
        accessibilityLabel={`Review payment of ${review.amountBch} ${unit}`}
        style={s.reviewHero}
      >
        <Amount value={review.amountBch} style={s.reviewAmount} faintStyle={s.amountPlaceholder} />
        <Text style={s.amountUnit}>{unit}</Text>
      </View>
      <View style={s.detailCard}>
        <DetailRow first stacked mono label="To" value={review.address} />
        <DetailRow label="Network" value={config.label} />
        <DetailRow label="Amount" value={`${review.amountBch} ${unit}`} />
        <DetailRow label="Network fee" value={`${review.feeBch} ${unit}`} />
        <DetailRow total label="Total" value={`${review.totalBch} ${unit}`} />
      </View>
      <Note>
        {mainnet ? 'Real BCH. This can’t be undone.' : 'Chipnet test funds, no real value.'} This review expires in two
        minutes.
      </Note>
      <PillButton
        label={busy ? 'Sending…' : mainnet ? 'Confirm and send real BCH' : `Send ${unit}`}
        testID="confirm-send"
        disabled={busy}
        onPress={send}
      />
      <View style={s.buttonGap}>
        <PillButton label="Cancel" secondary disabled={busy} onPress={cancel} />
      </View>
    </View>
  );
}

/** Shown once the network has accepted the payment. */
export function SentScreen({ payment, network, config, done }) {
  const unit = unitFor(network);
  return (
    <View testID="sent-screen">
      <View style={s.successMark}>
        <Check size={34} color={c.paper} strokeWidth={3} />
      </View>
      <Text testID="payment-success" accessibilityRole="header" style={s.successTitle}>
        Payment submitted
      </Text>
      <Text style={s.successAmount}>
        {payment.amountBch} {unit} on {config.label}
      </Text>
      <View style={[s.detailCard, s.cardGap]}>
        <DetailRow first stacked mono label="To" value={payment.address} />
        <DetailRow label="Network" value={config.label} />
        <DetailRow label="Amount" value={`${payment.amountBch} ${unit}`} />
        <View style={s.hairline} />
        <View style={s.detailStack}>
          <View style={s.infoRow}>
            <Text style={[s.detailLabel, s.fill]}>Transaction ID</Text>
            <Chip
              label="View"
              testID="view-transaction"
              onPress={() => Linking.openURL(`${config.explorer}${payment.txid}`)}
            />
          </View>
          <Text selectable style={s.transactionId}>
            {payment.txid}
          </Text>
        </View>
      </View>
      <PillButton label="Done" testID="sent-done" onPress={done} />
    </View>
  );
}

/** Compose, review and confirm one payment from the open wallet. */
export function SendFlow({ wallet, to = '', onDone }: { wallet: WalletState; to?: string; onDone(): void }) {
  const [recipient, setRecipient] = useState(to);
  const [amount, setAmount] = useState('');
  const [review, setReview] = useState<PaymentReview | null>(null);
  const [sent, setSent] = useState<{ address: string; amountBch: string; txid: string } | null>(null);
  const config = NETWORKS[wallet.network];
  // A failed review (such as too little balance) only concerns this screen. Clear it on the
  // way out so Wallet does not show it; send and pending-payment notices are always kept.
  const reviewFailed = useRef(false);
  const latest = useRef(wallet);
  useEffect(() => {
    latest.current = wallet;
  });
  useEffect(
    () => () => {
      if (reviewFailed.current && !latest.current.pending) latest.current.setNotice('');
    },
    [],
  );
  if (sent) return <SentScreen payment={sent} network={wallet.network} config={config} done={onDone} />;
  if (review)
    return (
      <ReviewScreen
        review={review}
        network={wallet.network}
        config={config}
        busy={wallet.busy === 'sending'}
        send={async () => {
          reviewFailed.current = false;
          const payment = await wallet.send(review);
          setReview(null);
          if (payment) setSent(payment);
        }}
        cancel={() => {
          wallet.cancelReview();
          setReview(null);
        }}
      />
    );
  return (
    <SendScreen
      balance={wallet.balance}
      network={wallet.network}
      config={config}
      busy={Boolean(wallet.busy)}
      pending={wallet.pending}
      notice={wallet.notice}
      recipient={recipient}
      setRecipient={setRecipient}
      amount={amount}
      setAmount={setAmount}
      prepare={async () => {
        const prepared = await wallet.prepare(recipient, amount);
        reviewFailed.current = !prepared;
        if (prepared) setReview(prepared);
      }}
      approver={wallet.signer ?? undefined}
    />
  );
}

const local = StyleSheet.create({
  scope: { color: c.muted, fontSize: 13, lineHeight: 18, marginBottom: 10, paddingHorizontal: 4 },
});
