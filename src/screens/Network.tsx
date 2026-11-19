import { useState } from 'react';
import { Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { SettingsGroup, SettingsRow, settingsStyle } from '../ui/SettingsList';
import { colors } from '../ui/theme';
import type { WalletState } from '../wallet/useWallet';

const OPTIONS = {
  chipnet: { label: 'Chipnet', detail: 'Test network · free test coins · Venns run here' },
  mainnet: { label: 'Mainnet', detail: 'Real BCH · ordinary payments only, no Venns' },
} as const;

export default function Network({ wallet }: { wallet: WalletState }) {
  const [confirming, setConfirming] = useState(false);
  const locked = Boolean(wallet.busy || wallet.pending);
  return (
    <View testID="network-settings">
      <Text style={settingsStyle.introduction}>
        Choose which Bitcoin Cash network this wallet uses. Coins on one network can’t move to the other.
      </Text>
      <SettingsGroup>
        {(['chipnet', 'mainnet'] as const).map(network => (
          <SettingsRow
            key={network}
            label={OPTIONS[network].label}
            detail={OPTIONS[network].detail}
            accessory={wallet.network === network ? <Check size={19} color={colors.ink} /> : <View />}
            testID={`network-${network}`}
            checked={wallet.network === network}
            disabled={locked}
            onPress={() => {
              if (network === 'mainnet') {
                setConfirming(wallet.network !== network);
                return;
              }
              setConfirming(false);
              if (wallet.network !== network) void wallet.changeNetwork(network);
            }}
          />
        ))}
      </SettingsGroup>
      {confirming ? (
        <>
          <Text accessibilityLiveRegion="polite" style={settingsStyle.introduction}>
            Mainnet uses real Bitcoin Cash. Payments can’t be undone and Chipnet test coins can’t move to Mainnet.
          </Text>
          <SettingsGroup>
            <SettingsRow testID="network-mainnet-confirm" label="Switch to Mainnet" disabled={locked} onPress={() => {
              setConfirming(false);
              void wallet.changeNetwork('mainnet');
            }} />
            <SettingsRow testID="network-mainnet-cancel" label="Stay on Chipnet" onPress={() => setConfirming(false)} />
          </SettingsGroup>
        </>
      ) : null}
      {wallet.pending ? (
        <Text style={[settingsStyle.introduction, settingsStyle.danger]}>
          Check the pending payment before changing networks.
        </Text>
      ) : null}
      <Text accessibilityRole="header" style={local.heading}>
        Why Venns are Chipnet-only
      </Text>
      <Text style={settingsStyle.introduction}>
        The Venn contract has not had an independent security review yet. Until it does, Venns hold Venn Test USD on
        Chipnet, which has no real value. On Mainnet you can hold and send real BCH; switch back to Chipnet to use
        Venns.
      </Text>
    </View>
  );
}

const local = {
  heading: { color: colors.ink, fontSize: 17, lineHeight: 24, fontWeight: '600', marginBottom: 6 },
} as const;
