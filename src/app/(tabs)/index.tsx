import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useApp } from '../../state/AppState';
import Home from '../../screens/Home';
import Page from '../../ui/Page';
import { styles } from '../../ui/styles';
import { open } from '../../navigation';

export default function WalletTab() {
  const { wallet, venns, history } = useApp();
  const name = wallet.wallet?.name;
  const focused = useIsFocused();
  const { backgroundRefresh } = wallet;
  const { reloadQuietly } = venns;
  // Coming back to Wallet reads balances again, the Venn key's included (QA 21 Nov, B3).
  useEffect(() => {
    if (!focused) return;
    backgroundRefresh();
    reloadQuietly();
  }, [focused, backgroundRefresh, reloadQuietly]);
  return (
    <Page top>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={name ? `${name}, wallets` : 'Wallets'}
          accessibilityHint="Switch, add or manage wallets."
          testID="header-wallet"
          onPress={() => open('wallets')}
        >
          <Text style={styles.cardTitle}>{name}</Text>
        </Pressable>
      </View>
      <Home wallet={wallet} venns={venns} history={history} open={open} />
    </Page>
  );
}
