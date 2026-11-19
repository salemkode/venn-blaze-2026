import Page from '../../ui/Page';
import { useApp } from '../../state/AppState';
import Wallets from '../../screens/Wallets';
import { close, open } from '../../navigation';
export default function WalletsPage() {
  const { wallet, localKeys } = useApp();
  return <Page><Wallets wallet={wallet} localKeys={localKeys} close={close} connect={() => open('connect')} /></Page>;
}
