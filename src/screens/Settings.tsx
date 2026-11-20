import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { BookOpen, Globe2, KeyRound, LogOut, WalletCards } from 'lucide-react-native';
import { close, open } from '../navigation';
import { SettingsGroup, SettingsRow, settingsStyle } from '../ui/SettingsList';
import { confirmAction } from '../ui/confirm';
import type { WalletState } from '../wallet/useWallet';
import { version } from '../../package.json';

export default function Settings({ wallet }: { wallet: WalletState }) {
  const connected = wallet.wallet?.connected;
  const locked = Boolean(wallet.busy || wallet.pending);
  const chipnet = wallet.network === 'chipnet';
  return (
    <View testID="settings-screen">
      <SettingsGroup title="Wallet">
        <SettingsRow
          label="Wallets"
          value={wallet.wallet?.name}
          detail="Switch, add, restore or connect a wallet"
          icon={WalletCards}
          onPress={() => open('wallets')}
          testID="settings-wallets"
        />
      </SettingsGroup>
      <SettingsGroup title="Security">
        {connected ? (
          <SettingsRow
            label="Signing wallet"
            value={wallet.signer ?? wallet.wallet?.name}
            icon={KeyRound}
            detail="Keys and their backup stay in the connected wallet."
          />
        ) : (
          <SettingsRow label="Recovery phrase" icon={KeyRound} onPress={() => open('recovery')} testID="settings-recovery" />
        )}
      </SettingsGroup>
      <SettingsGroup title="Network">
        <SettingsRow
          label="Network"
          value={chipnet ? 'Chipnet' : 'Mainnet'}
          detail={chipnet ? 'Test coins · Venns hold Venn Test USD' : 'Real BCH · Venns hold MUSD'}
          icon={Globe2}
          onPress={() => open('network')}
          testID="settings-network"
        />
      </SettingsGroup>
      <SettingsGroup title="About">
        <SettingsRow
          label="How Venn works"
          detail="Replay the introduction"
          icon={BookOpen}
          onPress={() => router.push('/intro')}
          testID="show-introduction"
        />
        <SettingsRow label="Version" value={version} />
      </SettingsGroup>
      {wallet.registry && wallet.registry.wallets.length > 1 ? (
        <SettingsGroup>
          <SettingsRow
            label={connected ? 'Disconnect wallet' : 'Remove wallet'}
            detail={connected ? 'Forget this connection on this device' : 'Erase this wallet from this device'}
            icon={LogOut}
            danger
            disabled={locked}
            testID="delete-wallet"
            onPress={() => confirmAction({
              title: `${connected ? 'Disconnect' : 'Remove'} ${wallet.wallet?.name}?`,
              message: connected
                ? 'Venn forgets this connection. The wallet and its funds stay where they are.'
                : 'Its recovery phrase is erased from this device. Without a written copy, its funds and Venn seats are lost.',
              cancel: 'Cancel',
              action: connected ? 'Disconnect' : 'Remove wallet',
              destructive: true,
              onConfirm: async () => { close(); await wallet.remove(); },
            })}
          />
        </SettingsGroup>
      ) : null}
      <View style={settingsStyle.footer}>
        <Text style={settingsStyle.footerText}>Experimental · contract not security audited</Text>
        <Text style={settingsStyle.footerText}>Venns use Venn Test USD on Chipnet and MUSD on Mainnet</Text>
      </View>
    </View>
  );
}
