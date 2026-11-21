// "Join a Venn" takes an invitation or the code of a Venn you were added to, explains any other
// code, and members with no BCH for fees are told how to add some.
import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, expect, it, vi } from 'vitest';
import { LOW_FEE_BALANCE, codeKind, extractCode, joinRefusal, needsFees } from '../../src/venn/codes';
import { encodeVennCode } from '../../src/venn/proposal';

const nav = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('react-native', () => ({
  Text: 'text', View: 'view', Pressable: 'button', Platform: { OS: 'android' },
  Share: { share: vi.fn(async () => undefined) }, Linking: { openURL: vi.fn() },
  StyleSheet: { create: (x: unknown) => x },
}));
vi.mock('lucide-react-native', () => Object.fromEntries(['BadgeCheck', 'ChevronRight', 'Fuel', 'Share2', 'ShieldAlert', 'Users'].map(n => [n, () => null])));
vi.mock('../../src/ui/kit', () => ({
  PillButton: ({ label, onPress, testID, disabled }: any) => React.createElement('button', { onPress, testID, disabled }, label),
  Field: ({ value, onChangeText, testID, error }: any) => React.createElement('input', { value, onChangeText, testID, error }),
  Note: ({ children }: any) => React.createElement('note', null, children),
  DetailRow: () => null, SafeQR: () => null,
}));
vi.mock('../../src/ui/SettingsList', () => ({ SettingsRow: () => null }));
vi.mock('../../src/ui/confirm', () => ({ confirmAction: () => undefined }));
vi.mock('../../src/navigation', () => ({ open: nav.open }));
vi.mock('../../src/screens/Circle', () => ({ CircleRow: () => null, CircleTerms: () => null }));
vi.mock('../../src/screens/VennDecisions', () => ({ VennDecisions: () => null }));
vi.mock('../../src/screens/LiveVenn', () => ({ LiveVennCard: () => null }));

const { JoinScreen } = await import('../../src/screens/Venns');

const VAULT = 'ab'.repeat(32);
const vennCode = encodeVennCode({ network: 'mainnet', vaultCategory: VAULT, name: 'Family' });

const venns = (over: Record<string, unknown> = {}) =>
  ({
    network: 'mainnet',
    keyBalance: 0n,
    keyCode: 'venn:key:abc',
    followVenn: vi.fn(async () => 'Family'),
    openInvite: vi.fn(() => { throw new Error('not an invite'); }),
    ...over,
  }) as any;

const text = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());
const byId = (r: ReactTestRenderer, id: string) => r.root.find(n => n.props.testID === id && typeof n.type === 'string');

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  nav.open.mockClear();
});

it('tells each kind of code apart, even inside a pasted message', () => {
  expect(codeKind(vennCode)).toBe('venn');
  expect(codeKind(`Join us: ${vennCode} thanks`)).toBe('venn');
  expect(extractCode(`Join us: ${vennCode} thanks`)).toBe(vennCode);
  expect(codeKind('venn:invite:xyz')).toBe('invite');
  expect(codeKind('venn:proposal:xyz')).toBe('proposal');
  expect(codeKind('hello')).toBe('unknown');
  expect(joinRefusal('venn')).toBe('');
  expect(joinRefusal('invite')).toBe('');
  expect(joinRefusal('proposal')).toMatch(/Approve a proposal/);
  expect(joinRefusal('unknown')).toMatch(/doesn’t look like a Venn code/);
});

it('prompts for fees only when the balance is known and low', () => {
  expect(needsFees(null)).toBe(false);
  expect(needsFees(0n)).toBe(true);
  expect(needsFees(LOW_FEE_BALANCE - 1n)).toBe(true);
  expect(needsFees(LOW_FEE_BALANCE)).toBe(false);
});

it('an added member joins with the Venn code and is offered a way to add BCH for fees', async () => {
  const v = venns();
  let r!: ReactTestRenderer;
  await act(async () => { r = create(<JoinScreen venns={v} onDone={() => undefined} />); });
  await act(async () => byId(r, 'invite-input').props.onChangeText(`Here is our Venn: ${vennCode}`));
  expect(text(r)).toContain('Add this Venn');
  await act(async () => byId(r, 'join-submit').props.onPress());
  expect(v.followVenn).toHaveBeenCalledWith(vennCode);
  expect(v.openInvite).not.toHaveBeenCalled();
  expect(text(r)).toContain('Family is in your Venns');
  await act(async () => byId(r, 'join-add-fees').props.onPress());
  expect(nav.open).toHaveBeenCalledWith('key', { funding: 'fees' });
});

it('no fee prompt after joining when the Venn key already has enough BCH', async () => {
  const v = venns({ keyBalance: 50_000n });
  let r!: ReactTestRenderer;
  await act(async () => { r = create(<JoinScreen venns={v} />); });
  await act(async () => byId(r, 'invite-input').props.onChangeText(vennCode));
  await act(async () => byId(r, 'join-submit').props.onPress());
  expect(text(r)).toContain('Family is in your Venns');
  expect(r.root.findAll(n => n.props.testID === 'join-add-fees')).toHaveLength(0);
});

it('explains a wrong code instead of failing, and shows following errors', async () => {
  const v = venns({ followVenn: vi.fn(async () => { throw new Error('That Venn is not official: unknown contract.'); }) });
  let r!: ReactTestRenderer;
  await act(async () => { r = create(<JoinScreen venns={v} />); });
  await act(async () => byId(r, 'invite-input').props.onChangeText('venn:proposal:abc'));
  await act(async () => byId(r, 'join-submit').props.onPress());
  expect(byId(r, 'invite-input').props.error).toMatch(/Approve a proposal/);
  expect(v.followVenn).not.toHaveBeenCalled();
  await act(async () => byId(r, 'invite-input').props.onChangeText(vennCode));
  await act(async () => byId(r, 'join-submit').props.onPress());
  expect(byId(r, 'invite-input').props.error).toMatch(/can’t be followed: That Venn is not official/);
});
