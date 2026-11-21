// A live Venn on Mainnet, readable by anyone without a wallet: the web's window onto what the
// phone apps do. Read-only.
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LiveVennCard } from '../screens/LiveVenn';
import { PillButton } from '../ui/kit';
import { styles as s } from '../ui/styles';
import { colors as c } from '../ui/theme';

const VIDEO = 'https://venn.salemkode.com/blaze/venn-mainnet-demo.mp4';
const ANDROID = 'https://venn.salemkode.com/android';
const IPHONE = 'https://appdrop.app/d/8g7cx3rw6x';

export default function Live() {
  return (
    <ScrollView contentContainerStyle={local.content}>
      <Text style={s.body}>
        This Shared Venn was created on Bitcoin Cash Mainnet from the Android app. Its rules live in a CashScript
        contract and each member&apos;s budget in a CashToken card, so what you see below is read from the chain, not
        from a server of ours. Spending from a Venn needs the phone app.
      </Text>
      <LiveVennCard />
      <View style={local.actions}>
        <PillButton label="Watch it in the app (79 s)" onPress={() => Linking.openURL(VIDEO)} />
        <PillButton label="Get the Android app" secondary onPress={() => Linking.openURL(ANDROID)} />
        <PillButton label="Get the iPhone app" secondary onPress={() => Linking.openURL(IPHONE)} />
      </View>
    </ScrollView>
  );
}

const local = StyleSheet.create({
  content: { padding: 20, gap: 4, backgroundColor: c.background },
  actions: { gap: 10, marginTop: 20 },
});
