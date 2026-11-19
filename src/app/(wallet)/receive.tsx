import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import Page from '../../ui/Page';
import { useApp } from '../../state/AppState';
import Receive, { type ReceiveAsset } from '../../screens/Receive';
import { open } from '../../navigation';

/** `?asset=usd|bch` picks the starting asset; without it Venn Test USD leads when available. */
export default function ReceivePage() {
  const { wallet, venns } = useApp();
  const param = z.object({ asset: z.enum(['usd', 'bch']) }).safeParse(useLocalSearchParams());
  const requested = param.success ? param.data.asset : null;
  // A manual pick lasts until a link asks for a different asset on this same screen.
  const [picked, setPicked] = useState<{ asset: ReceiveAsset; for: ReceiveAsset | null } | null>(null);
  const asset =
    picked && picked.for === requested ? picked.asset : (requested ?? (venns.available ? 'usd' : 'bch'));
  return (
    <Page>
      <Receive
        network={wallet.network}
        walletAddress={wallet.address}
        usdAddress={venns.keyTokenAddress}
        usdSupported={venns.available}
        usdError={venns.error}
        asset={asset}
        onAssetChange={next => setPicked({ asset: next, for: requested })}
        openKey={() => open('key')}
        retry={() => void venns.reload()}
      />
    </Page>
  );
}
