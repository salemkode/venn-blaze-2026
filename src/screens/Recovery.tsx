import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { PillButton } from '../ui/kit';
import { settingsStyle } from '../ui/SettingsList';
import { confirmAction } from '../ui/confirm';
import { colors } from '../ui/theme';
import type { WalletState } from '../wallet/useWallet';

export default function Recovery({ wallet }: { wallet: WalletState }) {
  const [phrase, setPhrase] = useState('');
  const revision = useRef(0);
  const mounted = useRef(false);
  const hide = useCallback(() => { revision.current++; setPhrase(''); }, []);
  useEffect(() => {
    const lifetime = mounted;
    const counter = revision;
    lifetime.current = true;
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') hide(); });
    return () => { lifetime.current = false; counter.current++; subscription.remove(); };
  }, [hide]);
  const reveal = async () => {
    if (!mounted.current || AppState.currentState !== 'active') return;
    const current = revision.current;
    const words = await wallet.readPhrase();
    if (mounted.current && revision.current === current && AppState.currentState === 'active') setPhrase(words ?? '');
  };
  if (wallet.wallet?.connected)
    return (
      <Text style={settingsStyle.introduction}>
        Your keys stay in {wallet.wallet.name}. Back up its recovery phrase in that wallet.
      </Text>
    );
  const words = phrase ? phrase.split(/\s+/) : [];
  return (
    <View testID="recovery-screen">
      <Text style={settingsStyle.introduction}>
        These words restore {wallet.wallet?.name ?? 'your wallet'}, its funds and your Venn seats on any device. Venn
        keeps them only in this device’s secure storage and never sends them anywhere.
      </Text>

      <Text accessibilityRole="header" style={local.heading}>Write it down offline</Text>
      <Text style={local.body}>
        Copy the words, in order, onto paper and keep it somewhere private. Avoid screenshots, photos, notes apps, email
        and cloud storage. If this device is lost without a written copy, the wallet can’t be restored, and the app
        can’t yet recover a Venn seat for you.
      </Text>

      <View style={local.warning}>
        <Text accessibilityRole="header" style={local.warningTitle}>Never share it</Text>
        <Text style={local.warningText}>
          Anyone with these words can spend your funds and act for you in your Venns. Nobody legitimate, including Venn,
          will ask for them.
        </Text>
      </View>

      {words.length ? (
        <View testID="recovery-words" style={local.words}>
          {words.map((word, n) => (
            <View key={n} style={local.word}>
              <Text style={local.wordNumber}>{n + 1}</Text>
              <Text style={local.wordText}>{word}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={local.concealed}>
          <Text style={local.concealedText}>Hidden. Reveal only where nobody can see your screen.</Text>
        </View>
      )}

      <PillButton
        label={phrase ? 'Hide recovery phrase' : 'Reveal recovery phrase'}
        testID="toggle-recovery"
        disabled={Boolean(wallet.busy)}
        onPress={() => phrase ? hide() : confirmAction({
          title: 'Keep these words private',
          message: 'Make sure nobody can see your screen. Never share the phrase with a website or support agent.',
          cancel: 'Cancel', action: 'Show phrase', onConfirm: reveal,
        })}
      />
    </View>
  );
}

// Plain style objects: this screen renders in tests with a minimal react-native mock.
const local = {
  heading: { color: colors.ink, fontSize: 17, lineHeight: 24, fontWeight: '600', marginBottom: 6 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 16 },
  warning: { backgroundColor: colors.warning, borderRadius: 20, padding: 16, marginBottom: 16, gap: 4 },
  warningTitle: { color: colors.warningInk, fontSize: 15, fontWeight: '700' },
  warningText: { color: colors.warningInk, fontSize: 14, lineHeight: 20 },
  concealed: {
    backgroundColor: colors.tile,
    borderRadius: 16,
    minHeight: 120,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  concealedText: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  words: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.paper,
    borderRadius: 16,
    padding: 10,
    marginBottom: 16,
  },
  word: { width: '50%', flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 7, paddingHorizontal: 8 },
  wordNumber: { width: 22, textAlign: 'right', color: colors.faint, fontSize: 13, fontVariant: ['tabular-nums'] },
  wordText: { color: colors.ink, fontSize: 17, fontWeight: '500' },
} as const;
