import { Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ArrowUpRight, RefreshCw, Share2 } from 'lucide-react-native';
import Page from '../../ui/Page';
import { useApp } from '../../state/AppState';
import { Chip, Note, PillButton, SafeQR } from '../../ui/kit';
import { styles as s, badgeDotStyle } from '../../ui/styles';
import { colors as c } from '../../ui/theme';
import { formatSats } from '../../ui/format';
import { feeUnit, formatAssetAmount, networkName } from '../../venn/asset';
import { shareAddress } from '../../screens/Receive';
import { open } from '../../navigation';

/** One balance on the Venn key: what it is for, how much, and where to send more. */
function KeySection({
  title,
  eyebrow,
  balance,
  purpose,
  address,
  testID,
  network,
  children,
}: {
  network: string;
  title: string;
  eyebrow: string;
  balance: string;
  purpose: string;
  address: string;
  testID: string;
  children?: React.ReactNode;
}) {
  return (
    <View testID={testID} style={local.card}>
      <View style={s.inline}>
        <View style={badgeDotStyle(network)} />
        <Text style={local.eyebrow}>{eyebrow}</Text>
      </View>
      <View style={local.titleRow}>
        <Text accessibilityRole="header" style={[s.cardTitle, s.fill]}>
          {title}
        </Text>
        <Text testID={`${testID}-balance`} style={local.balance}>
          {balance}
        </Text>
      </View>
      <Text style={local.purpose}>{purpose}</Text>
      <View style={local.qr}>
        <SafeQR key={address} value={address} size={156} />
      </View>
      <Text testID={`${testID}-address`} selectable style={[s.categoryId, local.address]}>
        {address}
      </Text>
      <View style={local.actions}>
        <Chip
          label="Share address"
          accessibilityLabel={`Share address for ${title}`}
          onPress={() => shareAddress(address)}
        />
      </View>
      {children}
    </View>
  );
}

/**
 * The Venn key overview: its Venn Test USD (token-aware address) and the
 * separate tBCH it spends on network fees. `?funding=fees` puts fees first.
 */
export default function KeyPage() {
  const { wallet, venns } = useApp();
  const { funding } = useLocalSearchParams();
  const feesFirst = funding === 'fees';
  if (!venns.available)
    return (
      <Page>
        <Note>Venn keys exist only for wallets created on this device. Open a local wallet.</Note>
      </Page>
    );
  if (!venns.keyAddress || !venns.keyTokenAddress)
    return (
      <Page>
        {venns.error ? (
          <>
            <Note danger>Could not load your Venn key: {venns.error}</Note>
            <PillButton label="Try again" secondary onPress={() => void venns.reload()} />
          </>
        ) : (
          <Text style={s.caption}>Loading your Venn key…</Text>
        )}
      </Page>
    );
  const usd = (
    <KeySection
      network={venns.network}
      key="usd"
      testID="key-usd"
      title={venns.asset.symbol}
      eyebrow={`Token-aware address · ${networkName(venns.network)}`}
      balance={venns.keyTokens === null ? '—' : formatAssetAmount(venns.keyTokens)}
      purpose={`Money for your Venns. Deposits into a Venn come from here. Send only ${venns.asset.symbol} to this address.`}
      address={venns.keyTokenAddress}
    />
  );
  const fees = (
    <KeySection
      network={venns.network}
      key="fees"
      testID="key-fees"
      title="Network fees"
      eyebrow={`${feeUnit(venns.network)} · ${networkName(venns.network)}`}
      balance={venns.keyBalance === null ? '—' : formatSats(venns.keyBalance)}
      purpose={`${feeUnit(venns.network)} that pays network fees when you create, deposit into or pay from a Venn.`}
      address={venns.keyAddress}
    >
      <PillButton
        label="Fund fees from your wallet"
        icon={ArrowUpRight}
        testID="key-fund-fees"
        disabled={Boolean(wallet.pending) || Boolean(wallet.busy)}
        onPress={() => open('send', { to: venns.keyAddress })}
      />
    </KeySection>
  );
  return (
    <Page>
      <Text style={local.intro}>
        Your Venn key is a separate key in this wallet. It holds your Venn seats, {venns.asset.symbol} ready to deposit,
        and a little {feeUnit(venns.network)} for fees.
      </Text>
      {feesFirst ? [fees, usd] : [usd, fees]}
      {venns.error ? <Note danger>{venns.error}</Note> : null}
      <View style={s.buttonGap}>
        <PillButton
          label="Share my Venn key code"
          icon={Share2}
          secondary
          disabled={!venns.keyCode}
          onPress={() => Share.share({ message: venns.keyCode }).catch(() => undefined)}
        />
        <Text style={local.purpose}>
          Send this code to someone who is adding you to a Venn, or to a helper when this phone replaces a lost one. It
          holds no secret.
        </Text>
        <PillButton
          label={venns.status === 'loading' ? 'Refreshing…' : 'Refresh balances'}
          icon={RefreshCw}
          secondary
          disabled={venns.status === 'loading'}
          onPress={() => void venns.reload()}
        />
      </View>
    </Page>
  );
}

const local = StyleSheet.create({
  intro: { color: c.muted, fontSize: 15, lineHeight: 22, marginBottom: 14 },
  card: { backgroundColor: c.paper, borderRadius: 24, padding: 18, gap: 8, marginBottom: 12 },
  eyebrow: { color: c.muted, fontSize: 13, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  balance: { color: c.ink, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  purpose: { color: c.muted, fontSize: 14, lineHeight: 20 },
  qr: { alignSelf: 'center', padding: 10, marginTop: 4 },
  address: { textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'center', marginVertical: 4 },
});
