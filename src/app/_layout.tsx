import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../state/AppState';
import BlazeBanner from '../ui/BlazeBanner';
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
      <Stack.Screen name="live" options={{ title: 'A live Venn on Mainnet' }} />
      <Stack.Screen name="try" options={{ title: 'Try a Venn in your browser' }} />
      <Stack.Protected guard={wallet.phase === 'ready'}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Wallet' }} />
        <Stack.Screen name="(wallet)/recovery" options={{ title: 'Recovery phrase' }} />
        <Stack.Screen name="(wallet)/receive" options={{ title: 'Receive' }} />
        <Stack.Screen name="(wallet)/send" options={{ title: 'Send' }} />
        <Stack.Screen name="(wallet)/wallets" options={{ title: 'Wallets' }} />
        <Stack.Screen name="(wallet)/connect" options={{ title: 'Connect a wallet' }} />
        {/* Choosing a kind opens without a push: its first card grows from a dot to the screen. */}
        <Stack.Screen name="(wallet)/create" options={({ route }) => (route.params as { preset?: string } | undefined)?.preset
          ? { title: 'Create a Venn' }
          : { title: 'Create a Venn', headerShown: false, animation: 'none', gestureEnabled: false }} />
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
  if (Platform.OS !== 'web') return <AppProvider><StatusBar style="dark" /><Navigation /></AppProvider>;
  return (
    <AppProvider>
      <View style={{ flex: 1 }}>
        <BlazeBanner />
        <View style={{ flex: 1 }}><Navigation /></View>
      </View>
    </AppProvider>
  );
}
