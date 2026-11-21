// venn.salemkode.com/android must download the APK (the video end card and judge pages print it).
// @ts-ignore node types are not part of the app's tsconfig
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
// @ts-ignore plain ESM build script without types
import { ANDROID_APK_URL, redirectsFile } from '../../scripts/site-redirects.mjs';

it('redirects /android and /android/ to the APK file with a 302', () => {
  const lines = (redirectsFile() as string).trim().split('\n');
  expect(lines).toContain(`/android ${ANDROID_APK_URL} 302`);
  expect(lines).toContain(`/android/ ${ANDROID_APK_URL} 302`);
  expect(ANDROID_APK_URL).toMatch(/^https:\/\/github\.com\/salemkode\/venn-blaze-2026\/releases\/download\/[^/]+\/[^/]+\.apk$/);
});

it('the site build writes the redirects file next to the wallet', () => {
  const script = readFileSync(new URL('../../scripts/build-landing.mjs', import.meta.url), 'utf8');
  expect(script).toMatch(/writeFile\(new URL\('\.\.\/_redirects', output\), redirectsFile\(\)\)/);
});

it('pages and app link Android to the short link that downloads the APK, not a release page', () => {
  for (const file of ['docs/blaze/landing.html', 'src/screens/Venns.tsx', 'src/app/live.tsx']) {
    const text = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    expect(text, file).toContain('https://venn.salemkode.com/android');
    expect(text, file).not.toContain('releases/tag/blaze-2026-android-preview');
  }
});
