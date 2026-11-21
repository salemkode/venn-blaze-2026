// Approving a proposal someone shared: read exactly what the transaction does, checked
// against the Venn's coins on its network, then sign it with your Venn key. And following a Venn
// from its code on a new phone that is taking a seat back.
import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { Share2 } from 'lucide-react-native';
import { styles as s } from '../ui/styles';
import { colors as c } from '../ui/theme';
import { DetailRow, Field, Note, PillButton, SafeQR } from '../ui/kit';
import { formatSats } from '../ui/format';
import type { VennsState } from '../venn/useVenns';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Read = Awaited<ReturnType<VennsState['readProposal']>>;

export function ApproveScreen({ venns, onDone }: { venns: VennsState; onDone(): void }) {
  const [code, setCode] = useState('');
  const [read, setRead] = useState<Read | null>(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (answer && read)
    return (
      <View testID="approve-done">
        <Text accessibilityRole="header" style={a.title}>
          Approved
        </Text>
        <Text style={s.body}>Send this approval code back to whoever shared the proposal. They send it once enough people approve.</Text>
        <PillButton label="Share approval code" icon={Share2} onPress={() => Share.share({ message: answer }).catch(() => undefined)} />
        <View style={[s.receiveCard, a.code]}>
          <View style={s.qr}>
            <SafeQR value={answer} />
          </View>
          <Text selectable numberOfLines={3} style={s.address}>
            {answer}
          </Text>
        </View>
        <PillButton label="Done" secondary onPress={onDone} />
      </View>
    );

  if (!read)
    return (
      <View testID="approve-screen">
        <Text style={[s.body, a.intro]}>
          Paste the proposal a member sent you. You will see exactly what it does before you approve anything.
        </Text>
        <Field
          label="Proposal code"
          error={error}
          value={code}
          onChangeText={t => {
            setCode(t);
            setError('');
          }}
          autoCapitalize="none"
          autoCorrect={false}
          testID="proposal-input"
        />
        <PillButton
          label={busy ? 'Checking…' : 'Open proposal'}
          disabled={!code.trim() || busy}
          onPress={async () => {
            setBusy(true);
            try {
              setRead(await venns.readProposal(code));
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    );

  return (
    <View testID="approve-review">
      <Text accessibilityRole="header" style={a.title}>
        {read.proposal.title}
      </Text>
      <Text style={s.body}>In {read.saved.name}. Checked against the Venn on {read.proposal.network === 'mainnet' ? 'Mainnet' : 'Chipnet'} just now.</Text>
      <View style={[s.detailCard, a.lines]}>
        {read.described.lines.map((line, n) => (
          <Text key={n} style={s.body}>
            {line}
          </Text>
        ))}
      </View>
      <View style={s.detailCard}>
        <DetailRow first label="Approvals needed" value={String(read.proposal.need)} />
        <DetailRow label="Network fee (paid by the proposer)" value={formatSats(read.described.fee)} />
        <DetailRow label="Network" value={read.proposal.network === 'mainnet' ? 'Mainnet' : 'Chipnet'} />
      </View>
      {read.canSign ? (
        <Text style={a.hint}>Approving signs this exact transaction and nothing else. It cannot be changed afterwards.</Text>
      ) : (
        <Note>Your seat cannot approve this proposal: it needs {read.proposal.kind === 'recoveryRequest' ? 'helpers' : 'voters'} whose seats have no recovery waiting.</Note>
      )}
      {error ? <Note danger>{error}</Note> : null}
      <View style={a.actions}>
        <PillButton
          label={busy ? 'Signing…' : 'Approve'}
          testID="approve-confirm"
          disabled={!read.canSign || busy}
          onPress={async () => {
            setBusy(true);
            try {
              setAnswer(await venns.approveProposal(read.proposal));
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        />
        <PillButton label="Don’t approve" secondary disabled={busy} onPress={onDone} />
      </View>
    </View>
  );
}

export function FollowScreen({ venns, onDone }: { venns: VennsState; onDone(): void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <View>
      <Text style={[s.body, a.intro]}>
        On a new phone, send your Venn key code to a helper. Paste the Venn code here to follow it. After a recovery
        has waited long enough, the Venn’s page lets this phone take your seat. Added to a Venn as a new member? Use
        Join a Venn on the Venns tab instead.
      </Text>
      {venns.keyCode ? (
        <PillButton label="Share my Venn key code" icon={Share2} secondary onPress={() => Share.share({ message: venns.keyCode }).catch(() => undefined)} />
      ) : null}
      <Field
        label="Venn code"
        error={error}
        value={code}
        onChangeText={t => {
          setCode(t);
          setError('');
        }}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <PillButton
        label={busy ? 'Checking…' : 'Follow this Venn'}
        disabled={!code.trim() || busy}
        onPress={async () => {
          setBusy(true);
          try {
            await venns.followVenn(code);
            onDone();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </View>
  );
}

const a = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.6, color: c.ink, marginBottom: 6 },
  intro: { marginBottom: 16 },
  lines: { paddingVertical: 12, gap: 8, marginVertical: 12 },
  hint: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
  actions: { gap: 10, marginTop: 12 },
  code: { marginVertical: 12 },
});
