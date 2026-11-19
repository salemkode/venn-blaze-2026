import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { styles as s } from '../ui/styles';
import { colors } from '../ui/theme';
import { Field, Note, PillButton } from '../ui/kit';
import BrandMark from '../ui/BrandMark';
import Connect from './Connect';
import type { WalletState } from '../wallet/useWallet';

const PHRASE_LENGTHS = [12, 15, 18, 21, 24];

/** A quick shape check before restoring. The wallet still verifies the words and checksum. */
export function phraseProblem(text: string) {
  const count = text.trim().split(/\s+/).filter(Boolean).length;
  if (!count) return 'Enter your recovery phrase.';
  if (!PHRASE_LENGTHS.includes(count))
    return `A recovery phrase has 12, 15, 18, 21 or 24 words. This has ${count}.`;
  return '';
}

/** Props that keep a typed phrase out of autofill, spelling and suggestion stores. */
export const phraseInputProps = {
  multiline: true,
  autoCorrect: false,
  autoCapitalize: 'none',
  autoComplete: 'off',
  spellCheck: false,
  importantForAutofill: 'no',
  textContentType: 'none',
} as const;

type Mode = 'choose' | 'restore' | 'connect';

/** First wallet: create, restore from a phrase, or connect one you already use. */
export default function Welcome({
  wallet,
  localKeys,
  startWith,
}: {
  wallet: WalletState;
  localKeys: boolean;
  startWith: Mode;
}) {
  const [mode, setModeState] = useState<Mode>(localKeys ? startWith : 'connect');
  const [phrase, setPhrase] = useState('');
  const [attempted, setAttempted] = useState(false);
  const busy = Boolean(wallet.busy);
  const setMode = (next: Mode) => {
    setPhrase('');
    setAttempted(false);
    wallet.setNotice('');
    setModeState(next);
  };

  if (mode === 'connect')
    return (
      <View style={s.welcome}>
        <Text accessibilityRole="header" style={s.title}>
          Connect a wallet
        </Text>
        <View style={s.buttonGap}>
          <PillButton
            label="Change network"
            testID="first-wallet-change-network"
            secondary
            disabled={busy}
            onPress={() => router.push('/network')}
          />
        </View>
        <Connect
          network={wallet.network}
          onConnected={wallet.connect}
          onCancel={localKeys ? () => setMode('choose') : undefined}
        />
        {wallet.notice ? <Note danger>{wallet.notice}</Note> : null}
      </View>
    );

  if (mode === 'restore') {
    const problem = phraseProblem(phrase);
    const restore = () => {
      setAttempted(true);
      if (!problem) wallet.create(phrase);
    };
    return (
      <View testID="restore-screen" style={s.welcome}>
        <Text accessibilityRole="header" style={s.title}>
          Restore a wallet
        </Text>
        <Text style={s.intro}>
          Enter the words of your recovery phrase in order, separated by spaces. They are saved only in this
          device’s secure storage and never sent anywhere.
        </Text>
        <Field
          label="Recovery phrase"
          testID="restore-phrase"
          value={phrase}
          onChangeText={text => {
            setPhrase(text);
            if (wallet.notice) wallet.setNotice('');
          }}
          {...phraseInputProps}
          placeholder="12 or 24 words"
          hint="Check that nobody can see your screen."
          error={attempted ? problem || wallet.notice || undefined : undefined}
          autoFocus
        />
        <PillButton
          label={busy ? 'Restoring…' : 'Restore wallet'}
          testID="restore-confirm"
          disabled={busy || !phrase.trim()}
          onPress={restore}
        />
        <View style={s.buttonGap}>
          <PillButton label="Back" secondary testID="restore-cancel" disabled={busy} onPress={() => setMode('choose')} />
        </View>
      </View>
    );
  }

  return (
    <View testID="welcome-screen" style={s.welcome}>
      <View style={s.welcomeMark}>
        <BrandMark size={64} id="welcomeMark" />
      </View>
      <Text accessibilityRole="header" style={s.title}>
        Welcome to Venn.
      </Text>
      <Text style={s.intro}>
        A Bitcoin Cash wallet for money you share. Shared funds, called Venns, run on Chipnet with test money.
      </Text>
      <PillButton
        label={busy ? 'Creating wallet…' : 'Create a new wallet'}
        testID="create-wallet"
        disabled={busy}
        onPress={() => wallet.create()}
      />
      <Text style={local.explain}>Makes a new recovery phrase, kept only in this device’s secure storage.</Text>
      <PillButton
        label="Restore from a phrase"
        testID="restore-wallet"
        secondary
        disabled={busy}
        onPress={() => setMode('restore')}
      />
      <Text style={local.explain}>Use the 12 or 24 words of a wallet you already have.</Text>
      <PillButton
        label="Connect a wallet"
        testID="connect-wallet"
        secondary
        disabled={busy}
        onPress={() => setMode('connect')}
      />
      <Text style={local.explain}>
        Keys stay in another WizardConnect wallet that approves each payment. Venns need a phrase on this device.
      </Text>
      {wallet.notice ? <Note danger>{wallet.notice}</Note> : null}
    </View>
  );
}

const local = StyleSheet.create({
  explain: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 6, marginBottom: 18, marginHorizontal: 12 },
});
