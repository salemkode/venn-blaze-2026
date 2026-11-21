import Page from '../../ui/Page';
import { useApp } from '../../state/AppState';
import { router, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { PlanScreen } from '../../screens/Venns';
import { fingerprint } from '../../venn/invite';
import { Note, PillButton } from '../../ui/kit';
import { open } from '../../navigation';
import { Text } from 'react-native';
import { styles } from '../../ui/styles';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/venns'));

export default function PlanPage() {
  const { venns } = useApp();
  const params = z.object({ fingerprint: z.string() }).safeParse(useLocalSearchParams());
  const plan = params.success ? venns.preparing.find(item => fingerprint(item.invite) === params.data.fingerprint) : undefined;
  // Creating the Venn removes its plan; say it worked instead of "no longer available" (QA 21 Nov, B4).
  const madeVenn = params.success ? venns.venns.find(v => v.saved.plan === params.data.fingerprint) : undefined;
  const madeCircle = params.success ? venns.circles.find(c => c.saved.plan === params.data.fingerprint) : undefined;
  const made = madeVenn
    ? { name: madeVenn.saved.name, open: () => open('venn', { category: madeVenn.saved.category }) }
    : madeCircle
      ? { name: madeCircle.saved.name, open: () => open('circle', { category: madeCircle.saved.category }) }
      : null;
  return (
    <Page>
      {!plan && made ? (
        <>
          <Text accessibilityRole="header" style={styles.title}>{`${made.name} is created`}</Text>
          <Text style={styles.body}>
            It is on {venns.network === 'mainnet' ? 'Mainnet' : 'Chipnet'} now, and everyone who accepted sees it in their Venns
            tab within a minute.
          </Text>
          <PillButton label={`Open ${made.name}`} testID="plan-open-created" onPress={made.open} />
          <PillButton label="Back to Venns" secondary onPress={() => router.dismissTo('/(tabs)/venns')} />
        </>
      ) : plan ? (
        <PlanScreen venns={venns} invite={plan.invite} openKey={() => open('key')} onDeleted={leave} />
      ) : (
        <>
          <Note>
            {venns.status === 'loading'
              ? 'Loading your plans…'
              : 'This plan is no longer on this wallet: it was deleted, or created from another phone.'}
          </Note>
          <PillButton label="Back to Venns" secondary onPress={() => router.dismissTo('/(tabs)/venns')} />
        </>
      )}
    </Page>
  );
}
