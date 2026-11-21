import { useEffect } from 'react';
import { Text } from 'react-native';
import { useIsFocused } from 'expo-router';
import { VennList } from '../../screens/Venns';
import { useApp } from '../../state/AppState';
import Page from '../../ui/Page';
import { styles } from '../../ui/styles';
import { open } from '../../navigation';

export default function VennsTab() {
  const { venns, wallet } = useApp();
  const focused = useIsFocused();
  const { reloadQuietly } = venns;
  // Opening the tab reads the chain again, so a Venn someone else just created shows up (QA 21 Nov, B3).
  useEffect(() => {
    if (focused) reloadQuietly();
  }, [focused, reloadQuietly]);
  return (
    <Page
      top
      refreshing={venns.status === 'loading'}
      onRefresh={() => {
        void venns.reload();
        wallet.backgroundRefresh();
      }}
    >
      <Text accessibilityRole="header" style={styles.title}>Venns</Text>
      <VennList venns={venns} open={open} />
    </Page>
  );
}
