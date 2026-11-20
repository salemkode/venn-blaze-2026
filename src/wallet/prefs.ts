// Public preferences and the pending-payment guard, in app storage. No secrets here.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PendingRecord } from 'react-native-xo';
import { z } from 'zod';

export type Network = 'chipnet' | 'mainnet';

const KEYS = { network: 'venn.network', intro: 'venn.intro', pending: 'venn.pending' };

/** Venn starts on Mainnet; only an explicit choice keeps a wallet on Chipnet. */
export async function readNetwork(): Promise<Network> {
  return (await AsyncStorage.getItem(KEYS.network)) === 'chipnet' ? 'chipnet' : 'mainnet';
}
/** The network the person picked in Settings, or null if they never chose one. */
export async function readChosenNetwork(): Promise<Network | null> {
  const value = await AsyncStorage.getItem(KEYS.network);
  return value === 'chipnet' || value === 'mainnet' ? value : null;
}
export const saveNetwork = (network: Network) => AsyncStorage.setItem(KEYS.network, network);

export const readIntroSeen = async () => (await AsyncStorage.getItem(KEYS.intro)) === 'done';
export const rememberIntroSeen = () => AsyncStorage.setItem(KEYS.intro, 'done').catch(() => {});

const pendingSchema = z.object({
  walletId: z.string().min(1),
  network: z.enum(['chipnet', 'mainnet']),
  txid: z.string().regex(/^[0-9a-f]{64}$/),
  address: z.string().min(1),
  amountBch: z.string().regex(/^\d+(\.\d{1,8})?$/),
  record: z.object({ txid: z.string(), network: z.string() }).passthrough(),
});
export type PendingPayment = Omit<z.infer<typeof pendingSchema>, 'record'> & { record: PendingRecord };

/**
 * A payment that may have reached the network. It is saved before broadcast and blocks
 * new payments until checked, across restarts.
 */
export async function readPending(): Promise<PendingPayment | null> {
  const saved = await AsyncStorage.getItem(KEYS.pending);
  return saved ? (pendingSchema.parse(JSON.parse(saved)) as unknown as PendingPayment) : null;
}

export async function savePending(payment: PendingPayment) {
  const value = pendingSchema.parse(payment);
  if (value.record.txid !== value.txid || value.record.network !== value.network)
    throw new Error('The pending record does not match the payment.');
  if (await AsyncStorage.getItem(KEYS.pending)) throw new Error('Check the earlier payment first.');
  await AsyncStorage.setItem(KEYS.pending, JSON.stringify(value));
}

export const clearPending = () => AsyncStorage.removeItem(KEYS.pending);
