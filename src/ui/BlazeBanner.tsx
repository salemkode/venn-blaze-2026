// The BCH BLAZE 2026 rules ask for a top-of-page banner on the hosted demo: the pitch deck,
// the source, the work that existed before the event, and the project's CashTokens address.
// Native builds never show it.
import { Platform, StyleSheet, Text, View } from 'react-native';
import banner from '../../docs/blaze/banner.json';

// react-native-web renders a Text with `href` as a real link.
const A = ({ href, children }: { href: string; children: string }) => (
  <Text style={styles.link} {...({ href, hrefAttrs: { target: '_blank', rel: 'noopener' } } as object)}>
    {children}
  </Text>
);

// On a wide screen the web build shows the app inside a phone frame (scripts/web-phone-frame.mjs),
// whose page already carries the banner above the phone.
const insidePhoneFrame = () => typeof window !== 'undefined' && window.self !== window.top;

export default function BlazeBanner() {
  if (Platform.OS !== 'web' || insidePhoneFrame()) return null;
  return (
    <View style={styles.bar} accessibilityLabel="BCH BLAZE 2026 entry links">
      <Text style={styles.text}>
        <Text style={styles.strong}>{banner.event}</Text>
        {'  '}
        <A href={banner.deck.url}>{banner.deck.label}</A>
        {' · '}
        <A href={banner.source.url}>{banner.source.label}</A>
        {' · '}
        <A href={banner.before.changes}>What’s new</A>
        {'  '}
        {banner.before.label} ({banner.before.summary}): <A href={banner.before.source}>XO wallet</A>
        {' · '}
        <A href={banner.before.libauth}>Libauth adapter</A>
        {' · '}
        <A href={banner.before.demo}>demo</A>
        {'  '}
        {banner.votingAddress ? (
          <>
            EMBER2026: <Text style={styles.code}>{banner.votingAddress}</Text>
          </>
        ) : (
          'EMBER2026 address: coming soon'
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: '#7a0f1d', paddingVertical: 5, paddingHorizontal: 12 },
  text: { color: '#fff', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  strong: { fontWeight: '700' },
  link: { color: '#fff', textDecorationLine: 'underline' },
  code: { fontFamily: 'monospace', fontWeight: '600', fontSize: 11 },
});
