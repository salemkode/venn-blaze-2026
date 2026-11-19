// The wallet state machine: which wallet is open, on which network, its balance, and the
// one payment in flight. Every action that changes wallets or money holds `lock`.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { PaymentReview } from 'react-native-xo';
import type { Connection } from './connection';
import { connectionNetwork } from './connection';
import {
  type Network,
  type PendingPayment,
  clearPending,
  readNetwork,
  readPending,
  saveNetwork,
  savePending,
} from './prefs';
import { type Registry, activeWallet } from './registry';
import { addConnectedWallet, addWallet, readRegistry, readSecret, removeWallet, selectWallet } from './secure';
import { type Session, openSession } from './session';

/** The Electrum socket closed (server drop, network change or app suspension). */
export const connectionClosed = (error: unknown) =>
  error instanceof Error && /Electrum connection (is )?closed/.test(error.message);

export type Phase = 'loading' | 'new' | 'ready' | 'error';
export interface Balance {
  balanceBch: string;
  balanceSatoshis: string;
}

export function useWallet() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [network, setNetwork] = useState<Network>('chipnet');
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState<Balance | null>(null);
  const [pending, setPendingState] = useState<PendingPayment | null>(null);
  const [busy, setBusy] = useState<string | null>('opening');
  const [notice, setNotice] = useState('');
  const [signer, setSigner] = useState<string | null>(null);
  const session = useRef<Session | null>(null);
  const pendingRef = useRef<PendingPayment | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const foreground = useRef(true);

  const setPending = (value: PendingPayment | null) => {
    pendingRef.current = value;
    setPendingState(value);
  };

  /** Runs one wallet-changing action at a time; errors become the notice. */
  const run = useCallback(async <T>(label: string, task: () => Promise<T>): Promise<T | undefined> => {
    if (locked.current) return undefined;
    locked.current = true;
    setBusy(label);
    setNotice('');
    try {
      return await task();
    } catch (error) {
      setNotice(
        connectionClosed(error)
          ? 'The connection to the server dropped. Tap Refresh on Wallet to reconnect.'
          : (error as Error).message,
      );
      return undefined;
    } finally {
      locked.current = false;
      setBusy(null);
    }
  }, []);

  const open = useCallback(async (list: Registry | null, net: Network) => {
    const revision = ++generation.current;
    session.current?.close();
    session.current = null;
    setSigner(null);
    setBalance(null);
    setAddress('');
    if (!list) {
      setPhase('new');
      return;
    }
    const id = list.activeId;
    const secret = await readSecret(id);
    if (!secret) throw new Error('This wallet’s secure entry is missing. Nothing was changed.');
    const wallet = await openSession(id, secret, net);
    if (revision !== generation.current) return wallet.close();
    const saved = pendingRef.current;
    if (saved && saved.walletId === id && saved.network === net) wallet.restorePending(saved.record);
    session.current = wallet;
    setSigner(wallet.signer);
    setAddress(wallet.address);
    setPhase('ready');
    const snapshot = await wallet.refresh();
    if (revision === generation.current) setBalance(snapshot);
  }, []);

  const boot = useCallback(
    () =>
      run('opening', async () => {
        setPhase('loading');
        try {
          const [net, saved, list] = await Promise.all([readNetwork(), readPending(), readRegistry()]);
          setPending(saved);
          // A payment that still needs checking opens the wallet and network that made it.
          let current = list;
          const net2 = saved?.network ?? net;
          if (current && saved && saved.walletId !== current.activeId) {
            if (!current.wallets.some(w => w.id === saved.walletId))
              throw new Error('The wallet with a pending payment is missing. Restore it before continuing.');
            current = await selectWallet(saved.walletId);
          }
          setNetwork(net2);
          setRegistry(current);
          await open(current, net2);
        } catch (error) {
          setPhase('error');
          throw error;
        }
      }),
    [open, run],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initialize this external subscription before its async updates.
    boot();
    const sub = AppState.addEventListener('change', state => {
      foreground.current = state === 'active';
      if (state !== 'active') session.current?.cancelSend();
    });
    const counter = generation;
    const current = session;
    return () => {
      sub.remove();
      counter.current++;
      current.current?.close();
    };
  }, [boot]);

  const refresh = () =>
    run('refreshing', async () => {
      if (!session.current) return open(registry, network);
      try {
        setBalance(await session.current.refresh());
      } catch (error) {
        // A dropped server connection never reopens by itself. Refresh only reads, so it may start
        // a fresh session; open() restores any pending payment record. Sends are never retried.
        if (!connectionClosed(error)) throw error;
        await open(registry, network);
      }
    });

  const adopt = async (next: Registry) => {
    setRegistry(next);
    await open(next, network);
    return next;
  };

  const create = (phrase?: string) => run('saving', async () => adopt(await addWallet(phrase)));

  const connect = (connection: Connection) =>
    run('saving', async () => {
      const theirs = connectionNetwork(connection);
      if (theirs !== network)
        throw new Error(
          theirs === 'mainnet'
            ? 'That wallet is on Mainnet. Switch Venn to Mainnet in Settings, then connect again.'
            : 'That wallet is on a test network. Switch Venn to Chipnet, then connect again.',
        );
      return adopt(await addConnectedWallet(connection));
    });

  const switchTo = (id: string) =>
    run('switching', async () => {
      if (pendingRef.current) throw new Error('Check the pending payment first.');
      return adopt(await selectWallet(id));
    });

  const remove = () =>
    run('saving', async () => {
      if (!registry) return;
      if (pendingRef.current?.walletId === registry.activeId) throw new Error('Check the pending payment first.');
      await session.current?.disconnect();
      return adopt(await removeWallet(registry.activeId));
    });

  const changeNetwork = (next: Network) =>
    run('switching', async () => {
      if (pendingRef.current) throw new Error('Check the pending payment first.');
      await saveNetwork(next);
      setNetwork(next);
      await open(registry, next);
    });

  const prepare = (to: string, amountBch: string) =>
    run('preparing', async () => {
      if (pendingRef.current) throw new Error('Check the pending payment first.');
      if (!session.current) throw new Error('The wallet is not open yet.');
      return session.current.prepareSend({ address: to.trim(), amountBch });
    });

  const cancelReview = useCallback(() => session.current?.cancelSend(), []);

  /**
   * Sends a reviewed payment. Its pending record is saved before broadcast; an unclear
   * result keeps it, so nothing is ever sent twice automatically.
   */
  const send = (review: PaymentReview) =>
    run('sending', async () => {
      const wallet = session.current;
      if (!wallet || !registry) throw new Error('The wallet is not open.');
      const payment = {
        walletId: registry.activeId,
        network: review.network,
        txid: review.txid,
        address: review.address,
        amountBch: review.amountBch,
      };
      let saved = false;
      try {
        await wallet.broadcast(review.id, {
          persistPending: async record => {
            if (!foreground.current || session.current !== wallet) throw new Error('The approval is no longer active.');
            const value = { ...payment, record };
            await savePending(value);
            saved = true;
            setPending(value);
          },
        });
      } catch (error) {
        // Only an unclear broadcast may have reached the network.
        if (saved && (error as Error).name !== 'BroadcastUncertainError') {
          await clearPending();
          setPending(null);
        }
        throw error;
      }
      const status = await wallet.checkPending().catch(() => null);
      if (status?.resolved && status.status !== 'conflicted') {
        await clearPending();
        setPending(null);
      }
      setBalance(await wallet.refresh());
      return payment;
    });

  const checkPending = () =>
    run('checking', async () => {
      const wallet = session.current;
      if (!wallet || !pendingRef.current) return;
      const status = await wallet.checkPending();
      if (!status?.resolved)
        throw new Error('The payment is not visible yet. Nothing else was sent; check again later.');
      await clearPending();
      setPending(null);
      if (status.status === 'conflicted')
        setNotice('That payment was not found and its coins were spent elsewhere. It did not go through.');
      setBalance(await wallet.refresh());
    });

  /** The active wallet's recovery phrase, only while the app is in front. */
  const readPhrase = async () => {
    if (!registry || !foreground.current) return null;
    const secret = await readSecret(registry.activeId);
    return secret && !secret.startsWith('wizardconnect:') ? secret : null;
  };

  return {
    phase,
    registry,
    wallet: registry ? activeWallet(registry) : null,
    network,
    address,
    balance,
    pending,
    busy,
    notice,
    setNotice,
    signer,
    session,
    boot,
    refresh,
    create,
    connect,
    switchTo,
    remove,
    changeNetwork,
    prepare,
    cancelReview,
    send,
    checkPending,
    readPhrase,
  };
}

export type WalletState = ReturnType<typeof useWallet>;
