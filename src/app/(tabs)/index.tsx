import { Pressable, Text, View } from 'react-native';
import { useApp } from '../../state/AppState';
import Home from '../../screens/Home';
import Page from '../../ui/Page';
import { styles } from '../../ui/styles';
import { open } from '../../navigation';

export default function WalletTab() {
  const { wallet, venns, history } = useApp();
  const name = wallet.wallet?.name;
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
