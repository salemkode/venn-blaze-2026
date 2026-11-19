import { NativeTabs } from 'expo-router/native-tabs';
import { colors } from '../../ui/theme';

export default function Tabs() {
  return (
    <NativeTabs tintColor={colors.ink} backgroundColor={colors.paper}>
      <NativeTabs.Trigger name="index"><NativeTabs.Trigger.Label>Wallet</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon sf="creditcard" md="account_balance_wallet" /></NativeTabs.Trigger>
      <NativeTabs.Trigger name="venns"><NativeTabs.Trigger.Label>Venns</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon sf="person.2" md="group" /></NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings"><NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon sf="gearshape" md="settings" /></NativeTabs.Trigger>
    </NativeTabs>
  );
}
