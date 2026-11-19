import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, expect, it, vi } from 'vitest';
import SettingsTab from '../../src/app/(tabs)/settings';
import RecoveryPage from '../../src/app/(wallet)/recovery';

const state = vi.hoisted(() => ({
  focused: true,
  walletId: 'wallet-a',
  currentState: 'active',
  listener: (_state: string) => {},
  push: vi.fn(),
  readPhrase: vi.fn(async () => 'private-test-content'),
}));
vi.mock('expo-router', () => ({ useIsFocused: () => state.focused, router: { push: state.push, dismissTo: vi.fn() } }));
vi.mock('react-native', () => ({
  Text: 'text', View: 'view', Pressable: 'button',
  AppState: { get currentState() { return state.currentState; }, addEventListener: (_event, callback) => { state.listener = callback; return { remove() {} }; } },
}));
vi.mock('lucide-react-native', () => ({ ChevronRight: () => null, BookOpen: () => null, Globe2: () => null, KeyRound: () => null, LogOut: () => null, WalletCards: () => null }));
vi.mock('../../src/state/AppState', () => ({ useApp: () => ({ wallet: {
  wallet: { id: state.walletId, name: 'Wallet 1', connected: false }, network: 'chipnet', registry: { wallets: [{}] }, readPhrase: state.readPhrase,
} }) }));
vi.mock('../../src/ui/Page', () => ({ default: ({ children }) => children }));
vi.mock('../../src/ui/styles', () => ({ styles: {} }));
vi.mock('../../src/ui/kit', () => ({
  PillButton: ({ label, onPress, testID }) => React.createElement('button', { onPress, testID }, label),
}));
vi.mock('../../src/ui/confirm', () => ({ confirmAction: options => options.onConfirm() }));

beforeEach(() => {
  Object.assign(globalThis, { __DEV__: false, IS_REACT_ACT_ENVIRONMENT: true });
  state.focused = true;
  state.walletId = 'wallet-a';
  state.currentState = 'active';
  state.push.mockClear();
  state.readPhrase.mockReset().mockResolvedValue('private-test-content');
});

it('opens the recovery screen from Settings without reading the phrase', async () => {
  let view: ReactTestRenderer;
  await act(async () => { view = create(<SettingsTab />); });
  await act(async () => view.root.findByProps({ accessibilityLabel: 'Recovery phrase' }).props.onPress());
  expect(state.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/(wallet)/recovery' }));
  expect(state.readPhrase).not.toHaveBeenCalled();
  await act(async () => view.unmount());
});

it('does not reveal a late secure-storage result after the app backgrounds', async () => {
  const pending = Promise.withResolvers<string>();
  state.readPhrase.mockReturnValue(pending.promise);
  let view: ReactTestRenderer;
  await act(async () => { view = create(<RecoveryPage />); });
  await act(async () => { view.root.findByProps({ testID: 'toggle-recovery' }).props.onPress(); });
  expect(state.readPhrase).toHaveBeenCalledOnce();
  await act(async () => { state.currentState = 'background'; state.listener('background'); });
  await act(async () => { pending.resolve('private-test-content'); });
  expect(JSON.stringify(view.toJSON())).not.toContain('private-test-content');
  await act(async () => view.unmount());
});

for (const change of ['blur', 'wallet'] as const) {
  it(`clears revealed content after ${change} changes`, async () => {
    let view: ReactTestRenderer;
    await act(async () => { view = create(<RecoveryPage />); });
    await act(async () => { view.root.findByProps({ testID: 'toggle-recovery' }).props.onPress(); });
    expect(JSON.stringify(view.toJSON())).toContain('private-test-content');
    if (change === 'blur') state.focused = false;
    else state.walletId = 'wallet-b';
    await act(async () => view.update(<RecoveryPage />));
    expect(JSON.stringify(view.toJSON())).not.toContain('private-test-content');
    await act(async () => view.unmount());
  });
}
