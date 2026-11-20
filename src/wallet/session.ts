// Opens the active wallet: a react-native-xo session over its phrase, or a connected
// session whose payments the other wallet signs over WizardConnect.
import { connectWallet, createWallet } from 'react-native-xo';
import type { ConnectedSession, WalletSession } from 'react-native-xo';
import { decodeConnection } from './connection';
import type { Network } from './prefs';
import { saveConnection } from './secure';

export type Session = (WalletSession | ConnectedSession) & {
  /** Name of the wallet that signs, for connected wallets. */
  signer: string | null;
  disconnect(): Promise<void>;
};

export async function openSession(id: string, secret: string, network: Network): Promise<Session> {
  const connection = decodeConnection(secret);
  if (!connection) {
    const wallet = await createWallet({ mnemonic: secret, network });
    return Object.assign(wallet, { signer: null, disconnect: async () => {} });
  }
  // Loaded only when needed: the relay brings its own network code.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Load only after the platform backend is ready.
  const { openConnection } = require('./relay') as typeof import('./relay');
  const link = openConnection(connection, next => saveConnection(id, next).catch(() => {}));
  try {
    const wallet = await connectWallet({
      network,
      paths: link.connection.paths,
      signer: link.signer,
      walletName: link.connection.walletName,
    });
    const close = wallet.close.bind(wallet);
    return Object.assign(wallet, {
      signer: link.connection.walletName,
      close: () => {
        close();
        link.close();
      },
      disconnect: () => link.close(true),
    });
  } catch (error) {
    link.close();
    throw explainOpenError(error, link.connection.walletName, network);
  }
}

/** The XO library's network-mismatch text names a different app; say which network each side is on. */
export function explainOpenError(error: unknown, walletName: string, network: Network): unknown {
  if ((error as { code?: string } | null)?.code !== 'wrong-network') return error;
  const label = (net: Network) => (net === 'mainnet' ? 'Mainnet' : 'Chipnet');
  const other: Network = network === 'mainnet' ? 'chipnet' : 'mainnet';
  return new Error(
    `${walletName} is connected on ${label(other)}, but Venn is on ${label(network)}. ` +
      `Switch Venn back to ${label(other)}, or connect a wallet that is on ${label(network)}.`,
  );
}
