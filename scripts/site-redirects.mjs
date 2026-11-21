// Short links on venn.salemkode.com, written to dist/_redirects (Workers static assets apply it
// before serving files). /android downloads the signed APK itself, not a release page: the video
// end card and the judge pages print it, and people expect the tap to start the download.
export const ANDROID_APK_URL =
  'https://github.com/salemkode/venn-blaze-2026/releases/download/blaze-2026-android-preview/Venn-BLAZE-Android.apk';

export const REDIRECTS = [
  ['/android', ANDROID_APK_URL, 302],
  ['/android/', ANDROID_APK_URL, 302],
];

export const redirectsFile = () => REDIRECTS.map(([from, to, code]) => `${from} ${to} ${code}`).join('\n') + '\n';
