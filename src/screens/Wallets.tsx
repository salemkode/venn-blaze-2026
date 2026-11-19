import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors as c } from '../ui/theme';
import { styles as s, cardColorStyle } from '../ui/styles';
import { Field, Note, PillButton } from '../ui/kit';
import { CARD_COLORS, MAX_WALLETS } from '../wallet/registry';
import type { WalletState } from '../wallet/useWallet';
import { phraseInputProps, phraseProblem } from './Welcome';

/** Switch wallets, or add one: new, restored, or connected over WizardConnect. */
export default function Wallets({
  wallet,
  localKeys,
  connect,
  close,
}: {
  wallet: WalletState;
  localKeys: boolean;
  connect(): void;
  close(): void;
}) {
  const [importing, setImportingState] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [attempted, setAttempted] = useState(false);
  const registry = wallet.registry!;
  const locked = Boolean(wallet.busy || wallet.pending);
  const full = registry.wallets.length >= MAX_WALLETS;
  const setImporting = (on: boolean) => {
    setPhrase('');
    setAttempted(false);
    wallet.setNotice('');
    setImportingState(on);
  };

  if (importing) {
    const problem = phraseProblem(phrase);
    return (
      <View testID="wallets-screen">
        <Text accessibilityRole="header" style={local.heading}>
          Restore from a phrase
        </Text>
        <Text style={local.caption}>
          Enter the words in order, separated by spaces. They are saved only in this device’s secure storage.
        </Text>
        <Field
          label="Recovery phrase"
          testID="wallet-import-phrase"
          value={phrase}
          onChangeText={setPhrase}
          {...phraseInputProps}
          placeholder="12 or 24 words"
          hint="Check that nobody can see your screen."
          error={attempted ? problem || undefined : undefined}
          autoFocus
        />
        <PillButton
          label="Restore wallet"
          testID="wallet-import-confirm"
          disabled={locked || !phrase.trim()}
          onPress={async () => {
            setAttempted(true);
            if (problem) return;
            close();
            await wallet.create(phrase);
          }}
        />
        <View style={s.buttonGap}>
          <PillButton
            label="Cancel"
            secondary
            testID="wallet-import-cancel"
            disabled={Boolean(wallet.busy)}
            onPress={() => setImporting(false)}
          />
        </View>
      </View>
    );
  }

  return (
    <View testID="wallets-screen">
      <Text accessibilityRole="header" style={local.heading}>
        Your wallets
      </Text>
      <Text style={local.caption}>Tap a wallet to make it the active one.</Text>
      <View style={[s.detailCard, s.cardGap]}>
        {registry.wallets.map((w, n) => {
          const active = w.id === registry.activeId;
          const kind = w.connected ? 'Connected wallet' : 'Phrase on this device';
          return (
            <View key={w.id}>
              {n ? <View style={s.hairline} /> : null}
              <Pressable
                testID={`wallet-${w.id}`}
                accessibilityRole="radio"
                accessibilityLabel={`${w.name}, ${kind}${active ? ', active' : ''}`}
                accessibilityState={{ checked: active, disabled: locked }}
                disabled={locked}
                onPress={async () => {
                  close();
                  await wallet.switchTo(w.id);
                }}
                style={({ pressed }) => [s.networkOption, pressed ? s.pressed : null]}
              >
                <View style={[s.walletChip, cardColorStyle(CARD_COLORS[w.color])]} />
                <View style={s.fill}>
                  <Text style={s.cardTitle}>{w.name}</Text>
                  <Text style={s.subtitle}>
                    {active ? <Text style={local.active}>Active · </Text> : null}
                    {kind}
                  </Text>
                </View>
                <View style={[s.radio, active ? s.radioSelected : null]}>
                  {active ? <Check size={15} color={c.paper} strokeWidth={3} /> : null}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
      {wallet.pending ? <Note>Check the pending payment before switching or adding wallets.</Note> : null}

      <Text accessibilityRole="header" style={[local.heading, s.sectionGap]}>
        Add a wallet
      </Text>
      {full ? <Note>This device holds up to {MAX_WALLETS} wallets. Remove one in Settings to add another.</Note> : null}
      {localKeys ? (
        <>
          <PillButton
            label="New wallet"
            testID="wallet-new"
            disabled={locked || full}
            onPress={async () => {
              close();
              await wallet.create();
            }}
          />
          <Text style={local.explain}>Makes a new recovery phrase, kept only in this device’s secure storage.</Text>
          <PillButton
            label="Restore from a phrase"
            testID="wallet-import"
            secondary
            disabled={locked || full}
            onPress={() => setImporting(true)}
          />
          <Text style={local.explain}>Use the 12 or 24 words of a wallet you already have.</Text>
        </>
      ) : null}
      <PillButton
        label="Connect a wallet"
        testID="wallet-connect"
        secondary
        disabled={locked || full}
        onPress={connect}
      />
      <Text style={local.explain}>
        Keys stay in another WizardConnect wallet that approves each payment. Venns need a phrase on this device.
      </Text>
    </View>
  );
}

const local = StyleSheet.create({
  heading: { color: c.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.4, marginBottom: 4 },
  caption: { color: c.muted, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  explain: { color: c.muted, fontSize: 13, lineHeight: 18, marginTop: 6, marginBottom: 16, marginHorizontal: 12 },
  active: { color: c.green, fontWeight: '600' },
});
