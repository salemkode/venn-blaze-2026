import { useEffect, useState } from 'react';
import { router, useRootNavigationState } from 'expo-router';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { useApp } from '../state/AppState';
import { readIntroSeen, rememberIntroSeen } from '../wallet/prefs';
import Onboarding from '../screens/Onboarding';
import Welcome from '../screens/Welcome';
import Page from '../ui/Page';
import { Note, PillButton } from '../ui/kit';
import { styles } from '../ui/styles';

/** After this long on the entry screen, show a way forward instead of waiting silently. */
export const STALL_MS = 4000;

// Leave the entry screen for the tabs exactly once per app session. A second replace onto the
// tabs (for example <Redirect> firing again on a focus event) left an empty, inert tabs screen.
let leftForTabs = false;
const leaveForTabs = () => {
  if (leftForTabs) return;
  leftForTabs = true;
  router.replace('/(tabs)');
};
/** Forget that the entry screen was left (also used by tests). */
export const resetEntryForTests = () => {
  leftForTabs = false;
};

export default function Entry() {
  const { wallet, localKeys } = useApp();
  const [seen, setSeen] = useState<boolean | null>(null);
  const [startWith, setStartWith] = useState<'choose' | 'restore' | 'connect'>('choose');
  // The phase that has lasted longer than STALL_MS, if any.
  const [stalledPhase, setStalledPhase] = useState<string | null>(null);
  // A returning visitor's saved wallet can open before the navigator is ready; a redirect issued
  // then is dropped and leaves an empty screen. Leave only once it is ready.
  const navigationReady = Boolean(useRootNavigationState()?.key);
  useEffect(() => { readIntroSeen().then(setSeen, () => setSeen(true)); }, []);
  useEffect(() => {
    const timer = setTimeout(() => setStalledPhase(wallet.phase), STALL_MS);
    return () => clearTimeout(timer);
  }, [wallet.phase]);
  const stalled = stalledPhase === wallet.phase;
  useEffect(() => {
    // Back on the entry screen without an open wallet (removed, or a new one being set up): the
    // next time a wallet opens, leave again.
    if (wallet.phase !== 'ready') resetEntryForTests();
    else if (navigationReady) leaveForTabs();
  }, [wallet.phase, navigationReady]);
  const spinner = <View style={styles.loading}><ActivityIndicator /></View>;
  if (wallet.phase === 'ready') {
    if (!stalled) return spinner;
    return (
      <Page>
        <Text accessibilityRole="header" style={styles.title}>Your wallet is open</Text>
        <PillButton label="Open wallet" testID="entry-open" onPress={() => router.replace('/(tabs)')} />
      </Page>
    );
  }
  if (wallet.phase === 'loading' || seen === null) {
    if (!stalled) return spinner;
    return (
      <Page>
        <Text accessibilityRole="header" style={styles.title}>Still opening your wallet</Text>
        <Note>This is taking longer than usual. Nothing has been changed, and your keys stay where they are.</Note>
        <PillButton label="Try again" testID="entry-retry-slow" onPress={wallet.boot} />
        {Platform.OS === 'web' ? (
          <PillButton label="Reload the page" secondary testID="entry-reload" onPress={() => globalThis.location?.reload()} />
        ) : null}
      </Page>
    );
  }
  const leave = (mode: typeof startWith) => {
    setStartWith(mode);
    setSeen(true);
    rememberIntroSeen();
  };
  if (wallet.phase === 'error')
    return (
      <Page>
        <Text accessibilityRole="header" style={styles.title}>Unable to open wallet</Text>
        <Note danger>{wallet.notice}</Note>
        <PillButton label="Try again" testID="entry-retry" onPress={wallet.boot} />
        <PillButton label="Change network" secondary testID="entry-network" onPress={() => router.push('/network')} />
      </Page>
    );
  if (!seen) return <Onboarding busy={Boolean(wallet.busy)} network={wallet.network} localKeys={localKeys} onCreate={() => { rememberIntroSeen(); wallet.create(); }} onRestore={() => leave('restore')} onConnect={() => leave('connect')} />;
  return <Page><Welcome wallet={wallet} localKeys={localKeys} startWith={startWith} /></Page>;
}
