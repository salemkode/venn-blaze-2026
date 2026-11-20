import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, expect, it, vi } from 'vitest';
import NetworkPage from '../../src/app/(wallet)/network';

const state = vi.hoisted(() => ({ pending: false, changeNetwork: vi.fn(), confirm: vi.fn() }));
vi.mock('react-native', () => ({ View: 'view', Text: 'text', Pressable: 'button' }));
vi.mock('lucide-react-native', () => ({ Check: () => null, ChevronRight: () => null }));
vi.mock('../../src/ui/Page', () => ({ default: ({ children }) => children }));
vi.mock('../../src/ui/confirm', () => ({ confirmAction: state.confirm }));
vi.mock('../../src/state/AppState', () => ({ useApp: () => ({ wallet: {
  network: 'chipnet', pending: state.pending ? {} : null, changeNetwork: state.changeNetwork,
} }) }));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.pending = false;
  state.changeNetwork.mockClear();
  state.confirm.mockClear();
});

it('requires explicit confirmation before switching to Mainnet', async () => {
  let view: ReactTestRenderer;
  await act(async () => { view = create(<NetworkPage />); });
  await act(async () => view.root.findByProps({ testID: 'network-mainnet' }).props.onPress());
  expect(state.changeNetwork).not.toHaveBeenCalled();
  expect(state.confirm).toHaveBeenCalledOnce();
  await act(async () => state.confirm.mock.calls[0][0].onConfirm());
  expect(state.changeNetwork).toHaveBeenCalledWith('mainnet');
  await act(async () => view.unmount());
});

it('disables network choices while a payment needs resolution', async () => {
  state.pending = true;
  let view: ReactTestRenderer;
  await act(async () => { view = create(<NetworkPage />); });
  expect(view.root.findByProps({ testID: 'network-chipnet' }).props.disabled).toBe(true);
  expect(view.root.findByProps({ testID: 'network-mainnet' }).props.disabled).toBe(true);
  await act(async () => view.unmount());
});

it('announces the selected network to screen readers', async () => {
  let view: ReactTestRenderer;
  await act(async () => { view = create(<NetworkPage />); });
  const chipnet = view.root.findAllByType('button').find(row => row.props.testID === 'network-chipnet');
  const mainnet = view.root.findAllByType('button').find(row => row.props.testID === 'network-mainnet');
  expect(chipnet?.props.accessibilityRole).toBe('radio');
  expect(chipnet?.props.accessibilityState).toMatchObject({ checked: true, disabled: false });
  expect(mainnet?.props.accessibilityState).toMatchObject({ checked: false, disabled: false });
  await act(async () => view.unmount());
});
