import Page from '../../ui/Page';
import { useApp } from '../../state/AppState';
import { useEffect } from 'react';
import { useLocalSearchParams, usePreventRemove } from 'expo-router';
import { z } from 'zod';
import { SendFlow } from '../../screens/Send';
import { close } from '../../navigation';

export default function SendPage() {
  const { wallet } = useApp();
  const params = z.object({ to: z.string().optional() }).parse(useLocalSearchParams());
  usePreventRemove(wallet.busy === 'sending', () => {});
  const cancel = wallet.cancelReview;
  useEffect(() => () => cancel(), [cancel]);
  return <Page><SendFlow wallet={wallet} to={params.to} onDone={close} /></Page>;
}
