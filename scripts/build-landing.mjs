import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { bannerHtml, readBanner } from './blaze-banner.mjs';

const source = new URL('../docs/blaze/', import.meta.url);
const withWallet = process.argv.includes('--with-wallet');
const output = new URL(withWallet ? '../dist/blaze/' : '../dist-landing/', import.meta.url);
const files = [
  'site.css',
  'site.js',
  'kinds.js',
  'images/venn-icon.png',
  'images/review-plan.jpg',
  'images/join-seat.jpg',
  'walkthrough.mp4',
  'venn-mainnet-demo.mp4',
  'transcript.txt',
  'venn-blaze-2026.pptx',
];
// The deck PDF is generated from the pitch deck; ship it when present.
if (existsSync(new URL('venn-blaze-2026.pdf', source))) files.push('venn-blaze-2026.pdf');

const banner = await readBanner();
if (!banner.votingAddress) console.warn('banner.json has no votingAddress yet: the banner says "coming soon".');
// Required by the BLAZE rules: a top-of-page banner with the deck, the source, the project's
// CashTokens address and, for work that began before the event, the earlier source and demo.
const bannerMarkup = bannerHtml(banner);

await mkdir(new URL('images/', output), { recursive: true });
await Promise.all(files.map(file => copyFile(new URL(file, source), new URL(file, output))));
const page = await readFile(new URL('landing.html', source), 'utf8');
const walletLink = withWallet ? '<a href="/">Open web wallet</a>' : '';
// The page's own footer must agree with the banner: one voting address (the approved one, or
// none yet) and the public source, never the private repository.
const vote = banner.votingAddress
  ? `<p class="blaze-vote">EMBER2026 voting on Bitcoin Cash Mainnet: <a href="${banner.votingAddress}"><code>${banner.votingAddress}</code></a></p>`
  : '';
const html = page
  .replace('<!-- hosted-wallet -->', walletLink)
  .replace(/<body([^>]*)>/, `<body$1>\n${bannerMarkup}`)
  .replace(/<p class="blaze-vote">[\s\S]*?<\/p>/, vote)
  .replace('https://github.com/salemkode/venn#readme', banner.source.url)
  // The grocery fund runs in the page only; say so, so nobody mistakes it for the chain.
  .replace(/(<h2 id="fund-title">[^<]*)(<\/h2>)/, '$1 <small style="font:600 .55em/1 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;opacity:.65;vertical-align:middle">Simulation</small>$2');
if (!html.includes('class="blaze-banner"')) throw new Error('Could not place the BLAZE banner: landing.html has no <body> tag.');
await writeFile(new URL('index.html', output), html);
console.log(withWallet ? 'Serve dist/ at the site root. Judge entry: /blaze/' : 'Landing page built in dist-landing/.');
