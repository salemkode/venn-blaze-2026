import { router, Stack, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import Page from '../../ui/Page';
import { useApp } from '../../state/AppState';
import { CircleScreen } from '../../screens/Circle';
import { Note, PillButton } from '../../ui/kit';

export default function CirclePage() {
  const { venns } = useApp();
  const params = z.object({ category: z.string() }).safeParse(useLocalSearchParams());
  const view = params.success ? venns.circles.find(item => item.saved.category === params.data.category) : undefined;
  if (view)
    return (
      <Page>
        <Stack.Screen options={{ title: view.saved.name }} />
        <CircleScreen view={view} venns={venns} />
      </Page>
    );
  return (
    <Page>
      <Note>{venns.status === 'loading' ? 'Loading your Circles…' : 'This Circle is no longer available.'}</Note>
      <PillButton label="Back to Venns" secondary onPress={() => router.dismissTo('/(tabs)/venns')} />
    </Page>
  );
}
