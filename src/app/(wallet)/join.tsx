import { router } from 'expo-router';
import Page from '../../ui/Page';
import { useApp } from '../../state/AppState';
import { JoinScreen } from '../../screens/Venns';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/venns'));

export default function JoinPage() {
  const { venns } = useApp();
  return <Page><JoinScreen venns={venns} onDone={leave} /></Page>;
}
