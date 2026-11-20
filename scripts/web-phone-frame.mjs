#!/usr/bin/env node
// Venn on the web is the phone app, not a desktop site. After `expo export --platform web`, this
// adds a small script to the top of index.html: on a wide screen the page shows the app inside a
// phone-sized frame of the same URL, so the app sees a phone-sized window and lays out exactly as
// on a phone. Phones and narrow windows run the app full-screen. The BCH BLAZE banner sits at the
// top of the outer page; the app hides its own copy when it runs inside the frame.
//
// Usage: node scripts/web-phone-frame.mjs [dist]
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bannerHtml, readBanner } from './blaze-banner.mjs';

const file = join(process.argv[2] ?? 'dist', 'index.html');
const html = await readFile(file, 'utf8');
const MARK = '<!-- venn-phone-frame -->';
if (html.includes(MARK)) {
  console.log('Phone frame already present.');
  process.exit(0);
}

const outer = `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Venn</title><link rel="icon" href="/favicon.ico">
<style>
html,body{margin:0;min-height:100%}
body{display:flex;flex-direction:column;min-height:100vh;background:radial-gradient(900px 520px at 85% 0%,rgba(31,203,140,.16),transparent 70%),radial-gradient(800px 520px at 0% 30%,rgba(122,15,29,.18),transparent 70%),#0c0d10;font:500 14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#a9adb5}
main{flex:1;display:grid;place-items:center;gap:14px;padding:20px 0 24px}
.stage{position:relative}
.phone{position:absolute;top:0;left:0;width:390px;height:844px;padding:11px;border-radius:60px;background:#1c1e23;box-shadow:0 0 0 1px #2c2f36,0 40px 90px -30px rgba(0,0,0,.85);transform-origin:top left}
.phone iframe{display:block;width:390px;height:844px;border:0;border-radius:49px;background:#f2f2f4}
main p{margin:0;text-align:center}main a{color:#3ee0a6;font-weight:700;text-decoration:none}main a:hover{text-decoration:underline}
</style></head>
<body>${bannerHtml(await readBanner())}
<main><div class="stage"><div class="phone"><iframe title="Venn" allow="clipboard-read; clipboard-write" src="__SRC__"></iframe></div></div>
<p>Venn on the web, shown as it looks on a phone. <a href="/blaze/" target="_top">What is Venn?</a></p></main></body>`;

// Kept dependency-free and small: it runs before anything else on the page.
const script = `${MARK}
<script>
(function () {
  if (window.self !== window.top) return;
  if (Math.min(window.innerWidth, screen.width) < 700) return;
  window.stop();
  var src = location.pathname + location.search + location.hash;
  document.documentElement.innerHTML = ${JSON.stringify(outer)}.replace('__SRC__', src.replace(/&/g, '&amp;').replace(/"/g, '&quot;'));
  // The app always gets a real phone's viewport (390x844); the whole phone is scaled to fit.
  function fit() {
    var banner = document.querySelector('.blaze-banner');
    var room = window.innerHeight - (banner ? banner.offsetHeight : 0) - 90;
    var scale = Math.max(0.55, Math.min(1, room / 866));
    var phone = document.querySelector('.phone'), stage = document.querySelector('.stage');
    phone.style.transform = 'scale(' + scale + ')';
    stage.style.width = Math.round(412 * scale) + 'px';
    stage.style.height = Math.round(866 * scale) + 'px';
  }
  fit();
  window.addEventListener('resize', fit);
})();
</script>`;

// Phone browsers (iOS 26 Safari especially) draw their toolbar over the bottom of a 100%-high
// page, hiding the tab bar. Size the app to the dynamic viewport, which excludes the toolbar.
const viewport = '<style id="venn-viewport">html,body,#root{height:100dvh}</style>';
// Both go right after <head>: the frame script itself contains "</head>" inside its string,
// so anything placed by searching for "</head>" would land inside the script and break it.
const out = html.replace(/<head>/i, `<head>\n${script}\n${viewport}`);
// Fail the build rather than ship a frame script that does not parse.
const inline = out.slice(out.indexOf(MARK)).match(/<script>([\s\S]*?)<\/script>/)[1];
new Function(inline);
await writeFile(file, out);
console.log(`Phone frame added to ${file}`);
