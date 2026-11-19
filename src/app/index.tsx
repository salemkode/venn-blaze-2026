import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { useApp } from '../state/AppState';
import { readIntroSeen, rememberIntroSeen } from '../wallet/prefs';
import Onboarding from '../screens/Onboarding';
import Welcome from '../screens/Welcome';
import Page from '../ui/Page';
import { Note, PillButton } from '../ui/kit';
import { styles } from '../ui/styles';

export default function Entry() {
  const { wallet, localKeys } = useApp();
  const [seen, setSeen] = useState<boolean | null>(null);
  const [startWith, setStartWith] = useState<'choose' | 'restore' | 'connect'>('choose');
  useEffect(() => { readIntroSeen().then(setSeen); }, []);
  if (wallet.phase === 'ready') return <Redirect href="/(tabs)" />;
  if (wallet.phase === 'loading' || seen === null) return <View style={styles.loading}><ActivityIndicator /></View>;
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
      </Page>
    );
  if (!seen) return <Onboarding busy={Boolean(wallet.busy)} network={wallet.network} localKeys={localKeys} onCreate={() => { rememberIntroSeen(); wallet.create(); }} onRestore={() => leave('restore')} onConnect={() => leave('connect')} />;
  return <Page><Welcome wallet={wallet} localKeys={localKeys} startWith={startWith} /></Page>;
}
