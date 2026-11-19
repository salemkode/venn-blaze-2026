import { useIsFocused } from 'expo-router';
import Page from '../../ui/Page';
import { useApp } from '../../state/AppState';
import Recovery from '../../screens/Recovery';
export default function RecoveryPage() {
  const { wallet } = useApp();
  const focused = useIsFocused();
  return <Page>{focused ? <Recovery key={wallet.wallet?.id} wallet={wallet} /> : null}</Page>;
}
