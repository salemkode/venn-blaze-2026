import Page from '../../ui/Page';
import { useApp } from '../../state/AppState';
import { router, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { PlanScreen } from '../../screens/Venns';
import { fingerprint } from '../../venn/invite';
import { Note, PillButton } from '../../ui/kit';
import { open } from '../../navigation';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/venns'));

export default function PlanPage() {
  const { venns } = useApp();
  const params = z.object({ fingerprint: z.string() }).safeParse(useLocalSearchParams());
  const plan = params.success ? venns.preparing.find(item => fingerprint(item.invite) === params.data.fingerprint) : undefined;
  return (
    <Page>
      {plan ? (
        <PlanScreen venns={venns} invite={plan.invite} openKey={() => open('key')} onDeleted={leave} />
      ) : (
        <>
          <Note>
            {venns.status === 'loading'
              ? 'Loading your plans…'
              : 'This plan is no longer available. It was either created as a Venn or deleted.'}
          </Note>
          <PillButton label="Back to Venns" secondary onPress={() => router.dismissTo('/(tabs)/venns')} />
        </>
      )}
    </Page>
  );
}
