import React from 'react';
import { Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Share as ShareIcon } from 'lucide-react-native';
import { NETWORKS } from 'react-native-xo';
import { colors as c } from '../ui/theme';
import { styles as s, badgeDotStyle } from '../ui/styles';
import { Note, PillButton, SafeQR } from '../ui/kit';
import { vennAsset } from '../venn/asset';

const FAUCET = 'https://tbch.googol.cash/';

export type ReceiveAsset = 'usd' | 'bch';

/** "tBCH" on Chipnet, "BCH" on Mainnet. */
export const bchUnit = (network: string) => (network === 'chipnet' ? 'tBCH' : 'BCH');

export const shareAddress = (address: string) => Share.share({ message: address });

/** A QR code with the asset and network above it and the full address below. */
export function AddressCard({
  address,
  asset,
  network,
  purpose,
  addressTestID = 'receive-address',
}: {
  address: string;
  asset: string;
  network: string;
  purpose: string;
  addressTestID?: string;
}) {
  return (
    <View style={s.receiveCard}>
      <View style={[s.inline, local.cardHeading]}>
        <View style={badgeDotStyle(network)} />
        <Text accessibilityRole="header" style={local.cardTitle}>
          {asset} · {NETWORKS[network].label}
        </Text>
      </View>
      <Text style={local.purpose}>{purpose}</Text>
      <View style={s.qr}>
        <SafeQR key={address} value={address} />
      </View>
      <Text testID={addressTestID} selectable style={[s.address, local.address]}>
        {address}
      </Text>
    </View>
  );
}

/** Two-way asset switch shown at the top of Receive. */
function AssetSwitch({
  value,
  options,
  onChange,
}: {
  value: ReceiveAsset;
  options: { value: ReceiveAsset; label: string }[];
  onChange(value: ReceiveAsset): void;
}) {
  return (
    <View accessibilityRole="tablist" style={local.switch}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={`Receive ${option.label}`}
            accessibilityState={{ selected }}
            testID={`receive-asset-${option.value}`}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [local.segment, selected ? local.segmentSelected : null, pressed ? s.pressed : null]}
          >
            <Text numberOfLines={1} style={[local.segmentText, selected ? local.segmentTextSelected : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Receive the Venn asset (Venn Test USD on Chipnet, MUSD on Mainnet) on the Venn key's token-aware
 * address, or tBCH/BCH on the wallet's own address. Venn keys exist only for local wallets.
 */
export default function Receive({
  network,
  walletAddress,
  usdAddress,
  usdSupported,
  usdError,
  asset,
  onAssetChange,
  openKey,
  retry,
}: {
  network: string;
  walletAddress: string;
  usdAddress: string;
  usdSupported: boolean;
  usdError?: string;
  asset: ReceiveAsset;
  onAssetChange(asset: ReceiveAsset): void;
  openKey(): void;
  retry(): void;
}) {
  const testnet = network === 'chipnet';
  const unit = bchUnit(network);
  const usd = vennAsset(testnet ? 'chipnet' : 'mainnet').symbol;
  const shown: ReceiveAsset = usdSupported ? asset : 'bch';
  const address = shown === 'usd' ? usdAddress : walletAddress;
  return (
    <View testID="receive-screen">
      {usdSupported ? (
        <AssetSwitch
          value={shown}
          options={[
            { value: 'usd', label: usd },
            { value: 'bch', label: unit },
          ]}
          onChange={onAssetChange}
        />
      ) : null}
      {address ? (
        <>
          <AddressCard
            address={address}
            asset={shown === 'usd' ? usd : unit}
            network={network}
            purpose={
              shown === 'usd'
                ? `This address is on your Venn key. ${usd} sent here funds your Venns.`
                : `This is your wallet address. ${unit} sent here adds to your wallet balance.`
            }
          />
          <PillButton label="Share address" icon={ShareIcon} onPress={() => shareAddress(address)} />
          {shown === 'bch' && testnet ? (
            <View style={s.buttonGap}>
              <PillButton label="Get free tBCH" secondary onPress={() => Linking.openURL(FAUCET)} />
            </View>
          ) : null}
          {shown === 'usd' ? (
            <View style={s.buttonGap}>
              <PillButton label="View your Venn key" secondary testID="receive-open-key" onPress={openKey} />
            </View>
          ) : null}
          <Text style={s.caption}>
            {shown === 'usd'
              ? `Send only ${usd} on ${testnet ? 'Chipnet' : 'Mainnet'} to this address. Venn ignores other tokens.`
              : testnet
                ? 'Chipnet only · test funds, no real value'
                : 'Mainnet · real BCH'}
          </Text>
        </>
      ) : shown === 'usd' && usdError ? (
        <>
          <Note danger>Could not load your Venn key: {usdError}</Note>
          <PillButton label="Try again" secondary onPress={retry} />
        </>
      ) : (
        <Text style={s.caption}>{shown === 'usd' ? 'Loading your Venn key address…' : 'Loading your address…'}</Text>
      )}
      {!usdSupported ? (
        <Text style={s.caption}>{usd} is available with a wallet created on this device.</Text>
      ) : null}
    </View>
  );
}

const local = StyleSheet.create({
  switch: {
    flexDirection: 'row',
    backgroundColor: c.tile,
    borderRadius: 22,
    padding: 4,
    marginBottom: 14,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  segmentSelected: { backgroundColor: c.paper },
  segmentText: { color: c.muted, fontSize: 15, fontWeight: '600' },
  segmentTextSelected: { color: c.ink },
  cardHeading: { alignSelf: 'stretch', justifyContent: 'center' },
  cardTitle: { color: c.paper, fontSize: 17, fontWeight: '700' },
  purpose: {
    color: c.cardMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
    paddingHorizontal: 6,
  },
  // A CashAddress has no spaces; browsers will not wrap it unless told to.
  address: { marginTop: 16, ...(Platform.OS === 'web' ? ({ wordBreak: 'break-all' } as object) : null) },
});
