// A read-only card showing a real Venn on Mainnet, read straight from the chain. Used on the
// web, where Venns cannot be spent from, so visitors can still see one working.
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { colors as c } from '../ui/theme';
import { styles as s } from '../ui/styles';
import { type LiveVenn, readLiveVenn } from '../venn/live';

/**
 * The web cannot spend from a Venn, but anyone can see one: this reads the Shared Venn made on
 * Mainnet from the Android app straight from the chain. Read-only; nothing is signed or sent.
 */
export function LiveVennCard() {
  const [live, setLive] = useState<LiveVenn | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    readLiveVenn()
      .then(result => current && setLive(result))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, []);
  return (
    <View testID="live-venn" style={[l.card]}>
      <Text accessibilityRole="header" style={l.title}>
        A live Venn on Mainnet
      </Text>
      <Text style={[s.subtitle, l.centered]}>Read from Bitcoin Cash just now. No wallet needed.</Text>
      {failed ? (
        <Text style={[s.body, l.centered]}>Could not reach the network right now. Try again later.</Text>
      ) : !live ? (
        <Text style={[s.body, l.centered]}>Reading the chain…</Text>
      ) : (
        <View style={l.body}>
          <Text style={[s.body, l.line]}>
            {live.official ? 'Official Venn contract (v2) · ' : `Not an official Venn: ${live.reason} · `}
            {live.balance} inside
          </Text>
          {live.members.map(member => (
            <Text key={member.label} style={[s.caption, l.line]}>
              {member.label}: {member.roles}. {member.budget}
              {member.recovering ? ' · recovery waiting' : ''}
            </Text>
          ))}
          <Text
            style={[s.caption, l.link]}
            accessibilityRole="link"
            onPress={() => Linking.openURL(`https://3xpl.com/bitcoin-cash/address/${live.address}`)}
          >
            See its money address on an explorer
          </Text>
        </View>
      )}
    </View>
  );
}

const l = StyleSheet.create({
  card: { backgroundColor: c.paper, borderRadius: 24, padding: 24, gap: 10, marginTop: 14, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: c.ink, textAlign: 'center' },
  body: { gap: 6, marginTop: 10, alignSelf: 'stretch' },
  line: { textAlign: 'left' },
  link: { color: c.ink, textDecorationLine: 'underline', marginTop: 4 },
  centered: { textAlign: 'center' },
});
