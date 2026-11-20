import { Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { SettingsGroup, SettingsRow, settingsStyle } from '../ui/SettingsList';
import { confirmAction } from '../ui/confirm';
import { colors } from '../ui/theme';
import type { WalletState } from '../wallet/useWallet';

const OPTIONS = {
  chipnet: { label: 'Chipnet', detail: 'Test network · free test coins · Venns hold Venn Test USD' },
  mainnet: { label: 'Mainnet', detail: 'Real BCH · Venns hold MUSD' },
} as const;

export default function Network({ wallet }: { wallet: WalletState }) {
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
              if (wallet.network === network) return;
              if (network === 'chipnet') return wallet.changeNetwork(network);
              confirmAction({
                title: 'Use real Bitcoin Cash?',
                message:
                  'Mainnet uses real BCH, and payments can’t be undone. Chipnet test coins can’t move to Mainnet. Venns on Mainnet hold real money in contracts that have had internal reviews but no external audit, so keep amounts small.',
                cancel: 'Stay on Chipnet',
                action: 'Switch to Mainnet',
                onConfirm: () => wallet.changeNetwork(network),
              });
            }}
          />
        ))}
      </SettingsGroup>
      {wallet.pending ? (
        <Text style={[settingsStyle.introduction, settingsStyle.danger]}>
          Check the pending payment before changing networks.
        </Text>
      ) : null}
      <Text accessibilityRole="header" style={local.heading}>
        Venns on each network
      </Text>
      <Text style={settingsStyle.introduction}>
        On Chipnet, Venns hold Venn Test USD, which has no real value: the place to try things. On Mainnet they hold
        MUSD (Moria USD) and pay fees in real BCH. Moria stopped minting MUSD in April 2026, so its dollar value depends
        on what others will pay for it. The Venn contracts have had two internal reviews, not an external audit, so
        keep Mainnet amounts small. Each network keeps its own Venns.
      </Text>
    </View>
  );
}

const local = {
  heading: { color: colors.ink, fontSize: 17, lineHeight: 24, fontWeight: '600', marginBottom: 6 },
} as const;
