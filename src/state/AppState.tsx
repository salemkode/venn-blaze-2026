import { createContext, useContext } from 'react';
import { Platform } from 'react-native';
import { useWallet } from '../wallet/useWallet';
import { useHistory } from '../wallet/useHistory';
import { useVenns } from '../venn/useVenns';

function useAppState() {
  const wallet = useWallet();
  const localKeys = Platform.OS !== 'web';
  const venns = useVenns(wallet.wallet?.id ?? null, wallet.network, wallet.phase === 'ready' && localKeys && !wallet.wallet?.connected);
  const history = useHistory(wallet.address, wallet.network);
  return { wallet, venns, history, localKeys };
}
const AppContext = createContext<ReturnType<typeof useAppState> | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const state = useAppState();
  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}

export function useApp() {
  const app = useContext(AppContext);
  if (!app) throw new Error('AppProvider is required.');
  return app;
}
