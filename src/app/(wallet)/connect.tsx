import Page from '../../ui/Page';
import { useApp } from '../../state/AppState';
import Connect from '../../screens/Connect';
import { close } from '../../navigation';
export default function ConnectPage() {
  const { wallet } = useApp();
  return <Page><Connect network={wallet.network} onConnected={async connection => { await wallet.connect(connection); close(); }} /></Page>;
}
