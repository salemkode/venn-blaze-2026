import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowDownLeft, ArrowUpRight, RefreshCw, X } from 'lucide-react-native';
import { useApp } from '../../state/AppState';
import BrandMark from '../../ui/BrandMark';
import { DetailRow, Note, PillButton } from '../../ui/kit';
import { styles as shared } from '../../ui/styles';
import { colors } from '../../ui/theme';
import { groupSats } from '../../ui/format';
import { feeUnit, networkName } from '../../venn/asset';

const grouped = groupSats;

type Move = Awaited<ReturnType<ReturnType<typeof useApp>['venns']['prepareMoveFees']>>;

export default function Fees() {
  const { venns, wallet } = useApp();
  const [move, setMove] = useState<Move | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const act = async (task: () => Promise<void>) => {
    setBusy(true);
    setNotice('');
    try {
      await task();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const insets = useSafeAreaInsets();
  const loading = venns.status === 'loading';
  const balance = venns.keyBalance === null ? 'unavailable' : `${grouped(venns.keyBalance)} sats`;
  return (
    <ScrollView contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={s.header}>
        <Text accessibilityRole="header" style={s.title}>Fee balance</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close fee balance" style={s.close}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/venns')}>
          <X size={18} color={colors.muted} />
        </Pressable>
      </View>
      <View style={s.card} accessible accessibilityLabel={`Fee balance on your Venn key: ${balance}, ${networkName(venns.network)}`}>
        <View style={s.topLine}>
          <Text style={s.cardLabel}>{feeUnit(venns.network)} on your Venn key</Text>
          <View style={s.network}><View style={s.dot} /><Text style={s.networkText}>{networkName(venns.network)}</Text></View>
        </View>
        <View style={s.balanceLine}>
          <Text adjustsFontSizeToFit numberOfLines={1} style={s.amount}>
            {venns.keyBalance === null ? '—' : grouped(venns.keyBalance)} <Text style={s.unit}>sats</Text>
          </Text>
          <BrandMark size={58} id="fee-mark" />
        </View>
      </View>
      <Text style={s.explanation}>
        Pays the network costs when you create, fund or pay from a Venn. It is separate from your {venns.asset.symbol}.
      </Text>
      {venns.error ? <Note danger>{venns.error}</Note> : null}
      <PillButton label={`Top up with ${feeUnit(venns.network)}`} icon={ArrowDownLeft} disabled={!venns.available || !venns.keyAddress}
        onPress={() => router.replace({ pathname: '/(wallet)/key', params: { funding: 'fees' } })} />
      {move ? (
        <View style={s.review}>
          <Text accessibilityRole="header" style={s.reviewTitle}>Move the fee balance to this wallet</Text>
          <View style={shared.detailCard}>
            <DetailRow first stacked mono label="To" value={move.address} />
            <DetailRow label="Amount" value={`${grouped(move.amount)} sats`} />
            <DetailRow label="Network fee" value={`${grouped(move.fee)} sats`} />
            <DetailRow label="Network" value={networkName(venns.network)} />
          </View>
          <Text style={s.explanation}>
            {venns.asset.symbol} and Venn seats stay on your Venn key. Creating or paying from a Venn needs a fee balance again.
          </Text>
          <PillButton label={busy ? 'Sending…' : `Move ${grouped(move.amount)} sats`} disabled={busy}
            onPress={() => act(async () => {
              await venns.sendPrepared(move);
              setMove(null);
              setNotice(`Moved to this wallet on ${networkName(venns.network)}.`);
            })} />
          <PillButton label="Cancel" secondary disabled={busy} onPress={() => setMove(null)} />
        </View>
      ) : (
        <PillButton label="Move to this wallet" icon={ArrowUpRight} secondary
          disabled={busy || !venns.available || !wallet.address || !venns.keyBalance || Boolean(venns.pending)}
          onPress={() => act(async () => setMove(await venns.prepareMoveFees(wallet.address)))} />
      )}
      {notice ? <Note>{notice}</Note> : null}
      <Pressable accessibilityRole="button" disabled={loading || !venns.available}
        accessibilityState={{ disabled: loading || !venns.available }} style={s.refresh} onPress={() => void venns.reload()}>
        <RefreshCw size={15} color={colors.muted} />
        <Text style={s.refreshText}>{loading ? 'Refreshing…' : 'Refresh balance'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 24, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1, fontSize: 24, fontWeight: '700', letterSpacing: -0.7, color: colors.ink },
  close: { minWidth: 44, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  card: { backgroundColor: colors.card, borderRadius: 22, padding: 20, gap: 12 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardLabel: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: colors.cardMuted },
  network: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.bch },
  networkText: { color: colors.paper, fontSize: 13, fontWeight: '600' },
  balanceLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  amount: { flex: 1, fontSize: 39, fontWeight: '700', letterSpacing: -1.6, color: colors.paper, fontVariant: ['tabular-nums'] },
  unit: { color: colors.cardMuted, fontSize: 22, letterSpacing: -0.5 },
  explanation: { color: colors.muted, fontSize: 15, lineHeight: 21, paddingVertical: 2 },
  refresh: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  refreshText: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  review: { gap: 10 },
  reviewTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
});
