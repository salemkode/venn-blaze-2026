import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const source = new URL('../docs/blaze/', import.meta.url);
const withWallet = process.argv.includes('--with-wallet');
const output = new URL(withWallet ? '../dist/blaze/' : '../dist-landing/', import.meta.url);
const files = [
  'site.css',
  'site.js',
  'images/create-a-venn-ios.png',
  'walkthrough.mp4',
  'transcript.txt',
  'venn-blaze-2026.pptx',
];

await mkdir(new URL('images/', output), { recursive: true });
await Promise.all(files.map(file => copyFile(new URL(file, source), new URL(file, output))));
const page = await readFile(new URL('landing.html', source), 'utf8');
const walletLink = withWallet ? '<a href="/">Open web wallet</a>' : '';
await writeFile(new URL('index.html', output), page.replace('<!-- hosted-wallet -->', walletLink));
console.log(withWallet ? 'Serve dist/ at the site root. Judge entry: /blaze/' : 'Landing page built in dist-landing/.');
