// A returning visitor's saved wallet opens almost at once, sometimes before the navigator is
// ready. The entry screen must never render nothing: it waits for the navigator, then leaves,
// and if it is still showing a few seconds later it offers a way forward.
import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  phase: 'loading' as string,
  navigationKey: undefined as string | undefined,
  replace: vi.fn(),
  boot: vi.fn(),
}));

vi.mock('react-native', () => ({ View: 'view', Text: 'text', ActivityIndicator: 'spinner', Platform: { OS: 'web' } }));
vi.mock('expo-router', () => ({
  router: { replace: state.replace, push: vi.fn() },
  useRootNavigationState: () => (state.navigationKey ? { key: state.navigationKey } : undefined),
}));
vi.mock('../../src/state/AppState', () => ({
  useApp: () => ({ localKeys: false, wallet: { phase: state.phase, boot: state.boot, busy: null, network: 'mainnet', notice: '' } }),
}));
vi.mock('../../src/wallet/prefs', () => ({ readIntroSeen: async () => true, rememberIntroSeen: vi.fn() }));
vi.mock('../../src/screens/Onboarding', () => ({ default: () => React.createElement('onboarding') }));
vi.mock('../../src/screens/Welcome', () => ({ default: () => React.createElement('welcome') }));
vi.mock('../../src/ui/Page', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('../../src/ui/kit', () => ({
  Note: ({ children }: { children: React.ReactNode }) => React.createElement('note', null, children),
  PillButton: (props: object) => React.createElement('button', props),
}));
vi.mock('../../src/ui/styles', () => ({ styles: {} }));

const { default: Entry, STALL_MS, resetEntryForTests } = await import('../../src/app/index');

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  state.phase = 'loading';
  state.navigationKey = undefined;
  state.replace.mockClear();
  state.boot.mockClear();
  resetEntryForTests();
});
afterEach(() => vi.useRealTimers());

const render = async () => {
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(<Entry />);
  });
  return view;
};
const rerender = async (view: ReactTestRenderer) => act(async () => view.update(<Entry />));

it('waits for the navigator when a saved wallet opens first, then leaves exactly once', async () => {
  state.phase = 'ready'; // the saved wallet opened before the navigator mounted
  const view = await render();
  expect(state.replace).not.toHaveBeenCalled();
  expect(view.root.findAllByType('spinner' as never)).toHaveLength(1);
  state.navigationKey = 'root';
  await rerender(view);
  expect(state.replace).toHaveBeenCalledWith('/(tabs)');
  // Later renders (focus, balance updates) must not replace the tabs again.
  await rerender(view);
  await rerender(view);
  expect(state.replace).toHaveBeenCalledTimes(1);
});

it('offers a visible button if it is still on the entry screen after opening', async () => {
  state.phase = 'ready';
  state.navigationKey = 'root';
  const view = await render();
  await act(async () => {
    vi.advanceTimersByTime(STALL_MS + 10);
  });
  expect(state.replace).toHaveBeenCalledTimes(1);
  const open = view.root.findByProps({ testID: 'entry-open' });
  await act(async () => open.props.onPress());
  expect(state.replace).toHaveBeenCalledTimes(2);
});

it('leaves again for a wallet opened after going back to the entry screen', async () => {
  state.phase = 'ready';
  state.navigationKey = 'root';
  const view = await render();
  state.phase = 'new'; // wallet removed
  await rerender(view);
  state.phase = 'ready'; // a new one connected
  await rerender(view);
  expect(state.replace).toHaveBeenCalledTimes(2);
});

it('never stays blank while a slow restore is still running', async () => {
  const view = await render();
  expect(view.root.findAllByType('spinner' as never)).toHaveLength(1);
  await act(async () => {
    vi.advanceTimersByTime(STALL_MS + 10);
  });
  const retry = view.root.findByProps({ testID: 'entry-retry-slow' });
  await act(async () => retry.props.onPress());
  expect(state.boot).toHaveBeenCalledOnce();
  expect(view.root.findByProps({ testID: 'entry-reload' })).toBeTruthy();
});
