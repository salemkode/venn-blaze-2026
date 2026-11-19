import Page from '../../ui/Page';
import { useApp } from '../../state/AppState';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { NETWORKS } from 'react-native-xo';
import { TransactionDetail } from '../../screens/Activity';
import { Note, PillButton } from '../../ui/kit';
import { close } from '../../navigation';

export default function TransactionPage() {
  const { wallet, history } = useApp();
  const params = z.object({ txid: z.string() }).safeParse(useLocalSearchParams());
  const item = params.success ? history.items.find(transaction => transaction.txid === params.data.txid) : undefined;
  const config = NETWORKS[wallet.network];
  if (item)
    return (
      <Page>
        <TransactionDetail
          item={item}
          unit={wallet.network === 'chipnet' ? 'tBCH' : 'BCH'}
          network={config.label}
          explorer={config.explorer}
        />
      </Page>
    );
  return (
    <Page>
      <Note>
        {history.status === 'loading'
          ? 'Loading your recent transactions…'
          : `This transaction isn’t in this wallet’s recent ${config.label} activity. It may belong to another wallet or network.`}
      </Note>
      <PillButton label="Back to wallet" secondary onPress={close} />
    </Page>
  );
}
