import { resolveEntryPoint } from 'expo/config/paths';
import { expect, it } from 'vitest';

const project = decodeURIComponent(new URL('../../', import.meta.url).pathname).replace(/\/$/, '');

it('boots the awaited WASM entry on web and native setup on iOS', () => {
  expect(resolveEntryPoint(project, { platform: 'web' })).toBe(`${project}/index.web.ts`);
  expect(resolveEntryPoint(project, { platform: 'ios' })).toBe(`${project}/index.ts`);
});
