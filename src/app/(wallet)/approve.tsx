import { router, Stack, useLocalSearchParams } from 'expo-router';
import Page from '../../ui/Page';
import { useApp } from '../../state/AppState';
import { ApproveScreen, FollowScreen } from '../../screens/Approve';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/venns'));

export default function ApprovePage() {
  const { venns } = useApp();
  const { follow } = useLocalSearchParams<{ follow?: string }>();
  return (
    <Page>
      <Stack.Screen options={{ title: follow ? 'Take your seat back' : 'Approve a proposal' }} />
      {follow ? <FollowScreen venns={venns} onDone={leave} /> : <ApproveScreen venns={venns} onDone={leave} />}
    </Page>
  );
}
