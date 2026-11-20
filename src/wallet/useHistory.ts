import { useCallback, useEffect, useRef, useState } from 'react';
import { NETWORKS } from 'react-native-xo';
import { type Branch, type HistoryItem, fetchHistory } from './history';
import type { Network } from './prefs';

export interface HistoryState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: HistoryItem[];
  reload(): void;
}

/** The newest transactions of `address` (and a connected wallet's branches), reloaded when they change. */
export function useHistory(address: string, network: Network, branches: Branch[] = []): HistoryState {
  const [state, setState] = useState<Omit<HistoryState, 'reload'>>({ status: 'idle', items: [] });
  const generation = useRef(0);
  // Compare branch keys by value: a new array with the same keys must not reload.
  const keys = JSON.stringify(branches);
  const reload = useCallback(async () => {
    const revision = ++generation.current;
    if (!address.startsWith(`${NETWORKS[network].prefix}:`)) return setState({ status: 'idle', items: [] });
    setState(current => ({ ...current, status: 'loading' }));
    try {
      const items = await fetchHistory(address, NETWORKS[network].endpoint, JSON.parse(keys) as Branch[]);
      if (revision === generation.current) setState({ status: 'ready', items });
    } catch {
      if (revision === generation.current) setState(current => ({ ...current, status: 'error' }));
    }
  }, [address, network, keys]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initialize this external subscription before its async updates.
    setState({ status: 'idle', items: [] });
    reload();
  }, [reload]);
  return { ...state, reload };
}
