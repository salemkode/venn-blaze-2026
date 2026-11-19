import { useIsFocused } from 'expo-router';
import { Text } from 'react-native';
import Settings from '../../screens/Settings';
import { useApp } from '../../state/AppState';
import Page from '../../ui/Page';
import { settingsStyle } from '../../ui/SettingsList';

export default function SettingsTab() {
  const { wallet } = useApp();
  const focused = useIsFocused();
  return (
    <Page top>
      <Text accessibilityRole="header" style={settingsStyle.title}>Settings</Text>
      {focused ? <Settings key={wallet.wallet?.id} wallet={wallet} /> : null}
    </Page>
  );
}
