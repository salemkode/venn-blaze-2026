import Page from '../../ui/Page';
import { useApp } from '../../state/AppState';
import Network from '../../screens/Network';
export default function NetworkPage() {
  const { wallet } = useApp();
  return <Page><Network wallet={wallet} /></Page>;
}
