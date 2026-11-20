// The BCH BLAZE 2026 banner as HTML, from docs/blaze/banner.json. The landing page and the
// desktop phone frame both put it at the top of the page.
import { readFile } from 'node:fs/promises';

const escape = value => String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const link = (href, text) => `<a href="${escape(href)}" target="_top">${escape(text)}</a>`;

export async function readBanner() {
  return JSON.parse(await readFile(new URL('../docs/blaze/banner.json', import.meta.url), 'utf8'));
}

export function bannerHtml(banner) {
  const vote = banner.votingAddress
    ? `EMBER2026: <code>${escape(banner.votingAddress)}</code>`
    : 'EMBER2026 address: coming soon';
  return `<aside class="blaze-banner" aria-label="BCH BLAZE 2026 entry links">
  <style>
    .blaze-banner{background:#7a0f1d;color:#fff;font:500 13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;padding:6px 12px;display:flex;flex-wrap:wrap;gap:2px 14px;justify-content:center;align-items:center;text-align:center}
    .blaze-banner a{color:#fff;text-decoration:underline;text-underline-offset:2px}
    .blaze-banner code{font:600 11.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;white-space:normal;background:none;color:#fff;padding:0;border:0}
    .blaze-banner strong{font-weight:700}
  </style>
  <strong>${escape(banner.event)}</strong>
  <span>${link(banner.deck.url, banner.deck.label)} · ${link(banner.source.url, banner.source.label)} · ${link(banner.before.changes, 'What’s new')}</span>
  <span>${escape(banner.before.label)} (${escape(banner.before.summary)}): ${link(banner.before.source, 'XO wallet')} · ${link(banner.before.libauth, 'Libauth adapter')} · ${link(banner.before.demo, 'demo')}</span>
  <span>${vote}</span>
</aside>`;
}
