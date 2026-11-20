import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, CircleDollarSign, RefreshCw } from 'lucide-react-native';
import { colors as c } from '../ui/theme';
import { styles as s } from '../ui/styles';
import { Note, PillButton } from '../ui/kit';
import { shortAddress } from '../ui/format';
import WalletCards from './WalletCards';
import { ActivityList } from './Activity';
import { activeWallet, behind } from '../wallet/registry';
import type { HistoryState } from '../wallet/useHistory';
import type { WalletState } from '../wallet/useWallet';
import type { VennsState } from '../venn/useVenns';
import { formatAssetAmount, networkName } from '../venn/asset';

export default function Home({
  wallet,
  venns,
  history,
  open,
}: {
  wallet: WalletState;
  venns: VennsState;
  history: HistoryState;
  open(sheet: string, options?: Record<string, string>): void;
}) {
  const registry = wallet.registry!;
  const busy = Boolean(wallet.busy);
  const unit = wallet.network === 'chipnet' ? 'tBCH' : 'BCH';
  // Each tile says why it is off, so a dimmed action is never a mystery.
  const tiles = [
    {
      id: 'receive',
      label: 'Receive',
      Icon: ArrowDownLeft,
      onPress: () => open('receive'),
      disabled: !wallet.address,
      reason: 'Your address is still loading.',
    },
    {
      id: 'send',
      label: 'Send',
      Icon: ArrowUpRight,
      onPress: () => open('send'),
      disabled: busy || Boolean(wallet.pending),
      reason: wallet.pending ? 'Check the payment above before sending again.' : 'Wait for the wallet to finish.',
    },
    {
      id: 'refresh',
      label: 'Refresh',
      Icon: RefreshCw,
      onPress: () => {
        wallet.refresh();
        venns.reload();
        history.reload();
      },
      disabled: busy,
      reason: 'Wait for the wallet to finish.',
    },
  ];
  return (
    <View testID="wallet-screen">
      {wallet.pending ? (
        <View testID="pending-payment" style={s.pendingCard}>
          <Text style={s.cardTitle}>Payment needs checking</Text>
          <Text style={s.subtitle}>
            {wallet.pending.amountBch} {unit} to {shortAddress(wallet.pending.address)}
          </Text>
          <Text style={s.body}>Check it before sending again. Nothing is ever sent twice automatically.</Text>
          <Text selectable style={s.transactionId}>
            {wallet.pending.txid}
          </Text>
          <PillButton label="Check payment status" disabled={busy} onPress={wallet.checkPending} />
        </View>
      ) : null}
      <WalletCards
        wallet={activeWallet(registry)}
        others={behind(registry)}
        balance={wallet.balance}
        network={wallet.network}
        disabled={busy}
        onPress={() => open('wallets')}
      />
      <View style={s.actions}>
        {tiles.map(tile => (
          <Pressable
            key={tile.id}
            accessibilityRole="button"
            accessibilityLabel={tile.label}
            accessibilityState={{ disabled: tile.disabled }}
            accessibilityHint={tile.disabled ? tile.reason : undefined}
            testID={`home-${tile.id}`}
            disabled={tile.disabled}
            onPress={tile.onPress}
            style={({ pressed }) => [s.tile, tile.disabled ? s.dimmed : null, pressed ? s.pressed : null]}
          >
            <tile.Icon size={24} color={c.ink} strokeWidth={2} />
            <Text style={s.tileText}>{tile.label}</Text>
          </Pressable>
        ))}
      </View>
      {wallet.pending ? (
        <Text style={[s.caption, local.paused]}>Send is paused until the payment above is checked.</Text>
      ) : null}
      {venns.available ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${venns.asset.symbol} on your Venn key, ${venns.keyTokens === null ? 'balance loading' : formatAssetAmount(venns.keyTokens)}`}
          accessibilityHint="Opens your Venn key with its addresses and fee balance."
          testID="home-venn-usd"
          onPress={() => open('key')}
          style={({ pressed }) => [s.assetCard, local.usdCard, pressed ? s.pressed : null]}
        >
          <View style={local.usdMark}>
            <CircleDollarSign size={22} color={c.tokenInk} strokeWidth={2} />
          </View>
          <View style={s.fill}>
            <Text style={s.cardTitle}>{venns.asset.symbol}</Text>
            <Text style={s.subtitle}>On your Venn key · {networkName(venns.network)}</Text>
          </View>
          <Text style={s.assetAmount}>{venns.keyTokens === null ? '—' : formatAssetAmount(venns.keyTokens)}</Text>
          <ChevronRight size={18} color={c.faint} />
        </Pressable>
      ) : null}
      {wallet.notice ? <Note danger>{wallet.notice}</Note> : null}
      <View style={s.activityBlock}>
        <ActivityList history={history} unit={unit} open={open} />
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  paused: { marginTop: -16, marginBottom: 16 },
  usdCard: { marginBottom: 22 },
  usdMark: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: c.tokenPaper,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
