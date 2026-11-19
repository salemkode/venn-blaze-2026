// Pair with a wallet you already use. Venn shows a WizardConnect code; the
// other wallet scans it (or opens the link) and shares its public keys. That
// wallet keeps its keys and approves every payment. Venns need a phrase on this
// device, so a connected wallet can't use them.
import React, { useEffect, useEffectEvent, useState } from 'react';
import { ActivityIndicator, Linking, Share, StyleSheet, Text, View } from 'react-native';
import { ExternalLink, Share as ShareIcon } from 'lucide-react-native';
import { colors as c } from '../ui/theme';
import { styles as s, badgeDotStyle } from '../ui/styles';
import { Note, PillButton, SafeQR } from '../ui/kit';
import type { Connection } from '../wallet/connection';
import type { Pairing } from '../wallet/relay';

const STATUS = {
  starting: 'Opening a secure relay…',
  waiting: 'Waiting for your wallet to scan…',
  reconnecting: 'Relay reconnecting…',
  saving: 'Connected. Checking its keys…',
};

const STEPS = [
  'Open a wallet that supports WizardConnect.',
  'Scan this code, or open or share the link below.',
  'Approve the connection in that wallet.',
];

const start = (onStatus: (status: string) => void): Pairing =>
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Load only after the platform backend is ready.
  (require('../wallet/relay') as typeof import('../wallet/relay')).startPairing(onStatus);

export default function Connect({
  network,
  onConnected,
  onCancel,
}: {
  network: string;
  onConnected(connection: Connection): Promise<unknown>;
  onCancel?: () => void;
}) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [status, setStatus] = useState<keyof typeof STATUS>('starting');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const saveConnection = useEffectEvent(onConnected);

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initialize this external subscription before its async updates.
    setError('');
    setStatus('starting');
    let current: Pairing;
    try {
      current = start(value => {
        if (!live) return;
        if (value === 'connected') setStatus(previous => (previous === 'saving' ? previous : 'waiting'));
        else if (value === 'reconnecting') setStatus('reconnecting');
      });
    } catch (cause) {
      setError((cause as Error).message);
      return undefined;
    }
    setPairing(current);
    current.ready
      .then(async connection => {
        if (!live) return;
        setStatus('saving');
        // The saved wallet reopens the relay with these credentials.
        current.cancel();
        await saveConnection(connection);
      })
      .catch(cause => {
        if (live) setError(cause.message);
      });
    return () => {
      live = false;
      current.cancel();
    };
  }, [attempt, network]);

  const uri = pairing?.uri;
  return (
    <View testID="connect-wallet-screen">
      <View accessibilityRole="list">
        {STEPS.map((step, n) => (
          <View key={step} accessible accessibilityLabel={`Step ${n + 1}. ${step}`} style={local.step}>
            <View style={local.stepNumber}>
              <Text style={local.stepNumberText}>{n + 1}</Text>
            </View>
            <Text style={local.stepText}>{step}</Text>
          </View>
        ))}
      </View>
      <View style={[s.receiveCard, local.qrGap]}>
        <View style={s.qr}>
          {uri ? <SafeQR value={pairing.qrUri || uri} /> : <ActivityIndicator color={c.ink} />}
        </View>
        <View style={[s.inline, s.receiveCaption]}>
          <View style={badgeDotStyle(network)} />
          <Text testID="connect-wallet-status" style={s.cardEyebrow}>
            {error ? 'Not connected' : STATUS[status]}
          </Text>
        </View>
        {uri ? (
          <Text testID="connect-wallet-uri" selectable numberOfLines={2} style={s.address}>
            {uri}
          </Text>
        ) : null}
      </View>
      {error ? <Note danger>{error}</Note> : null}
      {error ? (
        <PillButton label="Try again" testID="connect-wallet-retry" onPress={() => setAttempt(value => value + 1)} />
      ) : (
        <>
          <PillButton
            label="Open in a wallet on this device"
            icon={ExternalLink}
            testID="connect-wallet-open"
            disabled={!uri || status === 'saving'}
            onPress={() =>
              Linking.openURL(uri!).catch(() =>
                setError(
                  'No wallet on this device opened the link. Scan the code from another device or share the link.',
                ),
              )
            }
          />
          <View style={s.buttonGap}>
            <PillButton
              label="Share link"
              icon={ShareIcon}
              secondary
              testID="connect-wallet-share"
              disabled={!uri || status === 'saving'}
              onPress={() => Share.share({ message: uri! })}
            />
          </View>
        </>
      )}
      {onCancel ? (
        <View style={s.buttonGap}>
          <PillButton
            label="Cancel"
            secondary
            testID="connect-wallet-cancel"
            disabled={status === 'saving'}
            onPress={onCancel}
          />
        </View>
      ) : null}
      <Text style={s.caption}>
        {network === 'chipnet' ? 'Chipnet · connect a wallet that is also on Chipnet' : 'Mainnet · real BCH'}
      </Text>
      <View style={[s.infoCard, local.limits]}>
        <Text accessibilityRole="header" style={s.cardTitle}>
          What a connected wallet does
        </Text>
        <Text style={s.body}>
          It keeps its keys. Venn shows its balance and prepares ordinary BCH payments, and the wallet approves each one.
        </Text>
        <Text style={s.body}>
          It can’t create, join or pay from a Venn. Venns need a wallet whose recovery phrase is on this device.
        </Text>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { color: c.paper, fontSize: 13, fontWeight: '700' },
  stepText: { flex: 1, color: c.ink, fontSize: 15, lineHeight: 22, paddingTop: 1 },
  qrGap: { marginTop: 10 },
  limits: { marginTop: 20 },
});
