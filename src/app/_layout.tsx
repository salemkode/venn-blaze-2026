import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../state/AppState';
import { colors } from '../ui/theme';

function Navigation() {
  const { wallet } = useApp();
  const movingMoney = wallet.busy === 'sending';
  return (
    <Stack screenOptions={{ headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal', gestureEnabled: !movingMoney, headerBackVisible: !movingMoney, headerTintColor: colors.ink, headerStyle: { backgroundColor: colors.background }, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="intro" options={{ headerShown: false }} />
      <Stack.Screen name="development" options={{ title: 'Development checks' }} />
      <Stack.Screen name="(wallet)/network" options={{ title: 'Network' }} />
      <Stack.Protected guard={wallet.phase === 'ready'}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Wallet' }} />
        <Stack.Screen name="(wallet)/recovery" options={{ title: 'Recovery phrase' }} />
        <Stack.Screen name="(wallet)/receive" options={{ title: 'Receive' }} />
        <Stack.Screen name="(wallet)/send" options={{ title: 'Send' }} />
        <Stack.Screen name="(wallet)/wallets" options={{ title: 'Wallets' }} />
        <Stack.Screen name="(wallet)/connect" options={{ title: 'Connect a wallet' }} />
        <Stack.Screen name="(wallet)/create" options={{ title: 'Create a Venn' }} />
        <Stack.Screen name="(wallet)/join" options={{ title: 'Join a Venn' }} />
        <Stack.Screen name="(wallet)/plan" options={{ title: 'Invite people' }} />
        <Stack.Screen name="(wallet)/fees" options={{
          title: 'Fee balance', headerShown: false, presentation: 'formSheet',
          sheetAllowedDetents: [0.52, 0.88], sheetGrabberVisible: true, sheetCornerRadius: 30,
          contentStyle: { backgroundColor: colors.paper },
        }} />
        <Stack.Screen name="(wallet)/key" options={{ title: 'Your Venn key' }} />
        <Stack.Screen name="(wallet)/venn" options={{ title: 'Venn' }} />
        <Stack.Screen name="(wallet)/circle" options={{ title: 'Circle' }} />
        <Stack.Screen name="(wallet)/approve" options={{ title: 'Approve a proposal' }} />
        <Stack.Screen name="(wallet)/transaction" options={{ title: 'Transaction' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    if (__DEV__ && Platform.OS !== 'web') {
      import('expo-dev-menu').then(async menu => {
        menu.setToolsButtonVisible(false);
        await menu.registerDevMenuItems([{
          name: 'Development checks',
          callback: () => router.push('/development'),
          shouldCollapse: true,
        }]);
      });
    }
  }, []);
  return <AppProvider><StatusBar style="dark" /><Navigation /></AppProvider>;
}
