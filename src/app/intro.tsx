import { router } from 'expo-router';
import Onboarding from '../screens/Onboarding';
import { useApp } from '../state/AppState';
export default function Intro() {
  const { wallet, localKeys } = useApp();
  return <Onboarding network={wallet.network} localKeys={localKeys} onDone={() => router.back()} />;
}
