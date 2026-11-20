import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useApp } from '../../state/AppState';
import CreateVenn from '../../screens/CreateVenn';
import { VennPresetPicker } from '../../screens/VennPresetPicker';
import Page from '../../ui/Page';
import { Note } from '../../ui/kit';
import { fingerprint } from '../../venn/invite';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/venns'));

export default function CreatePage() {
  const { wallet, venns } = useApp();
  const { preset } = useLocalSearchParams<{ preset?: string }>();
  const type = preset === 'personal' || preset === 'shared' || preset === 'pot' || preset === 'circle' ? preset : null;

  if (!venns.publicKey) return <Page><Note>A wallet created on this device is required.</Note></Page>;
  if (!type) return <>
    <Stack.Screen options={{ headerShown: false }} />
    <VennPresetPicker
      onBack={leave}
      onPick={kind => router.push({ pathname: '/(wallet)/create', params: { preset: kind } })}
    />
  </>;

  return <>
    <Stack.Screen options={{ headerShown: true }} />
    <CreateVenn
      type={type}
      network={wallet.network}
      myKey={venns.publicKey}
      onSave={invite => venns.savePlan(invite)}
      onDone={invite => router.replace({ pathname: '/(wallet)/plan', params: { fingerprint: fingerprint(invite) } })}
    />
  </>;
}
