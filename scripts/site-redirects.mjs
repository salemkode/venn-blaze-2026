// Short links on venn.salemkode.com, written to dist/_redirects (Workers static assets apply it
// before serving files). /android downloads the signed APK itself, not a release page: the video
// end card and the judge pages print it, and people expect the tap to start the download.
//
// /android points at a versioned asset named after its checksum (docs/blaze/android-apk.json).
// A new APK is uploaded under its own new name first, then this file changes and the site is
// deployed, so the link never points at a file that is being replaced. (Replacing one asset in
// place with --clobber deletes it first: /android returned 404 for 12 minutes on 21 Nov.)
import { readFileSync } from 'node:fs';

export const APK = JSON.parse(readFileSync(new URL('../docs/blaze/android-apk.json', import.meta.url), 'utf8'));

export const ANDROID_APK_URL = `https://github.com/salemkode/venn-blaze-2026/releases/download/${APK.release}/${APK.asset}`;

export const REDIRECTS = [
  ['/android', ANDROID_APK_URL, 302],
  ['/android/', ANDROID_APK_URL, 302],
];

export const redirectsFile = () => REDIRECTS.map(([from, to, code]) => `${from} ${to} ${code}`).join('\n') + '\n';
