// Venn as a WizardConnect dapp: pair with another wallet, receive its branch xpubs, and
// ask it to sign payments. The other wallet keeps its keys and never broadcasts for us.
import { initiateDappRelay } from '@wizardconnect/core';
import { DappConnectionManager } from '@wizardconnect/dapp';
import type { ConnectedSignRequest } from 'react-native-xo';
import { type Connection, parseConnection, toRelayJson } from './connection';

const SESSION_KEY = 'venn-connection';
const SIGN_TIMEOUT_MS = 5 * 60 * 1000;

function memoryStorage(initial: string | null, onSave: (value: string) => void) {
  const values = new Map<string, string>(initial ? [[SESSION_KEY, initial]] : []);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
      onSave(value);
    },
    removeItem: (key: string) => values.delete(key),
  };
}

const managerFor = (storage: ReturnType<typeof memoryStorage>) =>
  new DappConnectionManager('Venn', undefined, { session: { key: SESSION_KEY, storage } });

export interface Pairing {
  uri: string;
  qrUri: string;
  ready: Promise<Connection>;
  cancel(): void;
}

/** Starts a pairing; `ready` resolves once the other wallet has shared its keys. */
export function startPairing(onStatus: (status: string) => void = () => {}): Pairing {
  let latest: string | null = null;
  const manager = managerFor(memoryStorage(null, value => (latest = value)));
  const ready = new Promise<Connection>((resolve, reject) => {
    manager.once('walletready', () => {
      try {
        const stored = JSON.parse(latest ?? '{}');
        resolve(
          parseConnection({
            ...stored,
            walletName: manager.walletName ?? stored.walletName,
            paths: manager.getSessionPaths(),
          }),
        );
      } catch (error) {
        reject(error);
      }
    });
    manager.once('disconnect', (_reason: unknown, message?: string) =>
      reject(new Error(message || 'The other wallet ended the connection.')),
    );
  });
  const relay = initiateDappRelay(({ client, status }: any) => {
    manager.updateConnection(client, status);
    onStatus(status.status);
  });
  manager.attachRelay(relay);
  let cancelled = false;
  return {
    uri: relay.uri,
    qrUri: relay.qrUri,
    ready,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      manager.destroy().finally(() => relay.cleanup());
    },
  };
}

/** Reopens a saved pairing. `signer` asks the other wallet to sign, never to broadcast. */
export function openConnection(saved: Connection, onSave: (next: Connection) => void) {
  const connection = parseConnection(saved);
  const manager = managerFor(
    memoryStorage(JSON.stringify(connection), value => {
      try {
        onSave(parseConnection(JSON.parse(value)));
      } catch {
        // A partial session write is completed by the next full one.
      }
    }),
  );
  const relay = initiateDappRelay(({ client, status }: any) => manager.updateConnection(client, status), {
    existingCredentials: {
      privateKey: connection.privateKey,
      secret: connection.secret,
      walletPublicKey: connection.walletPublicKey,
    },
  });
  manager.attachRelay(relay);
  manager.restoreSessionPaths(connection.paths);

  async function signer(request: Readonly<ConnectedSignRequest>) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SIGN_TIMEOUT_MS);
    try {
      const response = await manager.signTransaction(
        {
          transaction: {
            transaction: request.transaction,
            sourceOutputs: toRelayJson(request.sourceOutputs),
            broadcast: false,
            userPrompt: request.userPrompt,
          },
          inputPaths: request.inputPaths,
        } as any,
        { signal: controller.signal },
      );
      if (response.error) throw new Error(`${connection.walletName} declined: ${response.error}`);
      return response.signedTransaction as string;
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error(`${connection.walletName} did not answer in time. Nothing was sent.`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    connection,
    signer,
    async close(disconnect = false) {
      if (disconnect) await manager.sendDisconnect().catch(() => {});
      await manager.destroy().catch(() => {});
      relay.cleanup();
    },
  };
}
