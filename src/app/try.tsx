// Try a Venn in the browser, with play money: every transaction is built by the app and checked by
// the real Bitcoin Cash VM here, including the over-budget one the contract refuses. No wallet,
// nothing broadcast. Each step links the same step done on Mainnet.
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { PillButton } from '../ui/kit';
import { colors as c } from '../ui/theme';
import {
  FAILING_RULE,
  FAILING_RULE_LINE,
  type Playground,
  type StepResult,
  closeAndRefund,
  createPlayground,
  overspend,
  payWithinBudget,
} from '../venn/playground';

const TX = 'https://3xpl.com/bitcoin-cash/transaction/';
const RULE_URL = `https://github.com/salemkode/venn-blaze-2026/blob/hackathon/contracts/VennVault.cash#L${FAILING_RULE_LINE}`;
const VIDEO = 'https://venn.salemkode.com/blaze/venn-mainnet-demo.mp4';

/** The same step on Bitcoin Cash Mainnet, done in the Android app. */
const MAINNET = [
  { label: 'Venn created on Mainnet', txid: '618c2e9dad65dafc6ac3353514512bcd4f81e2ce03d436808f63e10a8f2acb7c' },
  { label: 'Paid alone on Mainnet', txid: 'aee01e645daeecf6367786ddeaa61e4163c14b61d65f64db67ffb3a80b50d7c0' },
  { label: 'On Mainnet the app refuses before signing (video)', url: VIDEO },
  { label: 'Paid out by vote on Mainnet', txid: '7c83610d85bd1ade4f04d59e39c731d6a7611a792cd4ba992173f71544c7b8fb' },
];

const STEPS = ['Create a Venn', 'Pay within the budget', 'Try to overspend', 'Close and refund'];

interface Done {
  step: StepResult;
  note?: string;
}

export default function Try() {
  const [state, setState] = useState<Playground | null>(null);
  const [done, setDone] = useState<Done[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const next = done.length;

  const run = (task: () => void) => {
    setBusy(true);
    setError('');
    // Let the button show "Checking…" before the VM runs.
    setTimeout(() => {
      try {
        task();
      } catch (e) {
        setError(`Something went wrong in this browser: ${(e as Error).message}. Start over to try again.`);
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  const step = () =>
    run(() => {
      if (next === 0) {
        const r = createPlayground();
        setState(r.state);
        setDone([{ step: r.step }]);
      } else if (next === 1 && state) {
        const r = payWithinBudget(state);
        setState(r.state);
        setDone(d => [...d, { step: r.step }]);
      } else if (next === 2 && state) {
        const r = overspend(state);
        setDone(d => [...d, { step: r.step, note: r.appRefusal }]);
      } else if (next === 3 && state) {
        const r = closeAndRefund(state);
        setState(r.state);
        setDone(d => [...d, { step: r.step }]);
      }
    });

  const reset = () => {
    setState(null);
    setDone([]);
    setError('');
  };

  return (
    <ScrollView contentContainerStyle={t.content} testID="try-venn">
      <Text style={t.lead}>
        Play money, real rules. Each step builds a real transaction with the Venn app&apos;s own code for the Venn
        contract and checks it with the Bitcoin Cash virtual machine, the same rules every node runs, right here in your
        browser. No wallet needed; nothing is broadcast.
      </Text>

      {STEPS.map((title, i) => {
        const d = done[i];
        const mainnet = MAINNET[i];
        return (
          <View key={title} style={[t.card, i === next && t.current]} testID={`try-step-${i + 1}`}>
            <Text style={t.stepTitle}>
              {i + 1}. {d ? d.step.title : title}
            </Text>
            {d ? (
              <>
                {d.note ? <Text style={t.body}>{d.note}</Text> : null}
                {i === 2 ? (
                  <Text style={[t.verdict, d.step.ok ? t.good : t.bad]}>
                    {d.step.vm === true
                      ? '✗ The VM accepted the forged payment (unexpected).'
                      : `✓ Forged anyway and run through the BCH VM: rejected.\n${d.step.vm}`}
                  </Text>
                ) : (
                  <Text style={[t.verdict, d.step.ok ? t.good : t.bad]}>
                    {d.step.vm === true ? '✓ Valid in the BCH VM' : `✗ The VM rejected it: ${d.step.vm}`}
                  </Text>
                )}
                {i === 2 ? (
                  <Text style={t.link} accessibilityRole="link" onPress={() => Linking.openURL(RULE_URL)}>
                    The rule that refused it: {FAILING_RULE} (VennVault.cash, line {FAILING_RULE_LINE})
                  </Text>
                ) : null}
                <Text style={t.body}>{d.step.detail}</Text>
                <Text style={t.mono} selectable>
                  {d.step.bytes} bytes · txid {d.step.txid.slice(0, 16)}…
                </Text>
                <Text
                  style={t.link}
                  accessibilityRole="link"
                  onPress={() => Linking.openURL(mainnet.url ?? `${TX}${mainnet.txid}`)}
                >
                  {mainnet.label}
                  {mainnet.txid ? `: ${mainnet.txid.slice(0, 8)}…` : ''}
                </Text>
              </>
            ) : null}
          </View>
        );
      })}

      {error ? <Text style={[t.verdict, t.bad]}>{error}</Text> : null}

      <View style={t.actions}>
        {next < STEPS.length && !error ? (
          <PillButton
            label={busy ? 'Checking in the VM…' : `${next + 1}. ${STEPS[next]}`}
            testID="try-next"
            disabled={busy}
            onPress={step}
          />
        ) : null}
        {next >= STEPS.length ? (
          <Text style={t.body}>
            Done: the budget held because the contract enforces it, not the app. To move real money, connect a wallet
            and send on Mainnet, or use the Android or iPhone app for real Venns.
          </Text>
        ) : null}
        {done.length || error ? <PillButton label="Start over" secondary testID="try-reset" onPress={reset} /> : null}
        <PillButton label="Make a real Mainnet payment" secondary onPress={() => router.replace('/')} />
        <PillButton label="Watch it on Mainnet (79 s video)" secondary onPress={() => Linking.openURL(VIDEO)} />
      </View>
    </ScrollView>
  );
}

const t = StyleSheet.create({
  content: { padding: 20, gap: 12, backgroundColor: c.background },
  lead: { color: c.ink, fontSize: 15, lineHeight: 21 },
  card: { backgroundColor: c.paper, borderRadius: 20, padding: 16, gap: 6 },
  current: { borderWidth: 2, borderColor: c.ink },
  stepTitle: { fontSize: 16, fontWeight: '700', color: c.ink },
  body: { color: c.muted, fontSize: 14, lineHeight: 20 },
  verdict: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  good: { color: '#127a4f' },
  bad: { color: '#b42318' },
  mono: { fontFamily: 'monospace', fontSize: 12, color: c.muted },
  link: { color: c.ink, textDecorationLine: 'underline', fontSize: 14, lineHeight: 20 },
  actions: { gap: 10, marginTop: 8 },
});
