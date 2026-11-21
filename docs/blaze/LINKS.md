# Venn · submission links

Status on 20 November 2026. “Pending” items wait for an approval in [TODO-BEFORE-SUBMIT.md](TODO-BEFORE-SUBMIT.md).

## Deck

| | Link | Status |
| --- | --- | --- |
| Widget Factory copy (Google Slides) | https://docs.google.com/presentation/d/1NcDfEq6mmGHIi0OvOzE1qG8dILfKJSs_7BqTaGnA9KI/edit | Imported 20 Nov by Sol (`gpt-6.2-sol`) from the PPTX; 12 slides, text, images and speaker notes checked against the renders; slide 6, 8, 9 and 10 spacing and table borders corrected. **Shared 20 Nov: Anyone with the link, Viewer**; opens signed out. |
| PowerPoint and PDF | [venn-blaze-2026.pptx](venn-blaze-2026.pptx) · [venn-blaze-2026.pdf](venn-blaze-2026.pdf) | Built from a copy of the official template; also served at `/blaze/venn-blaze-2026.pdf` after the next deploy. |
| Official template (never edited) | https://docs.google.com/presentation/d/1Yfuk9CJkf4U9M_WukcELhumWgj3Ak6345Ewy8hSp-Hk/edit | — |
| Earlier Google Slides draft | https://docs.google.com/presentation/d/1QlhgJcfTJWVvpg-cUVZjoKbgj-s2yUZquwFevxeT9qc/edit | Private; content from 18 Nov is out of date. Do not submit. |

## BUIDL

| | Link | Status |
| --- | --- | --- |
| DoraHacks BUIDL | https://dorahacks.io/buidl/51333 | Owner salemkode, Mainnet Track, listed on the BCH BLAZE 2026 Builds grid. Updated 20 Nov: Venn app icon as the logo (1024 px), new tagline and description with the Mainnet judge path, labelled evidence, Google Slides and .pptx deck links, source, voting address and pre-existing-work disclosure; links: source, judge page, deck, web wallet. Checked logged out; every link opens. |
| Hackathon page | https://dorahacks.io/hackathon/bchblaze2026/detail | — |

## Source

| | Link | Status |
| --- | --- | --- |
| After (presented work) | https://github.com/salemkode/venn-blaze-2026 · pinned: https://github.com/salemkode/venn-blaze-2026/tree/faa806c9c85d47dcdf22ce579188e32e648c7c85 | Public. Published 20 Nov as `faa806c` on branch `hackathon` (snapshot of `ff3dca1`; checked signed out). |
| Full history (private) | https://github.com/salemkode/venn | Private; `master` at `0f8152d`; this work is on the local branch `docs/blaze-final-submission`. |
| Before: XO React Native wallet template at kickoff | https://github.com/salemkode/xo-react-native-wallet/tree/b32a7fd85674791e557c4bc339da29f3842cf68f | Public. Last commit 14 Nov 13:55 UTC, before the 14:00 UTC kickoff. |
| Before: XO React Native wallet template, 13 Nov | https://github.com/salemkode/xo-react-native-wallet/tree/ba90bd04f9f4db52ce30b2cef69f662efbb32482 | Public. |
| Before: native Libauth adapter the template runs on | https://github.com/salemkode/react-native-libauth/tree/ccd225d749b55980612b44515bf47302e8b6b70c | Public. Created 13 Nov; last pre-event commit 14 Nov 13:52 UTC. |

## Demo

| | Link | Status |
| --- | --- | --- |
| After: judge page | https://venn.salemkode.com/blaze/ | Live: 21 Nov build from master `8d3e5b4` (Worker `venn-blaze`, version `ff895c5e`); checked at desktop and phone widths. |
| After: web wallet | https://venn.salemkode.com/ | Same. |
| After: Android preview | https://github.com/salemkode/venn-blaze-2026/releases/tag/blaze-2026-android-preview | Signed APK 0.2.0 (versionCode 2), built 20 Nov from master, opens on Mainnet; same signing certificate as 0.1.0 (SHA-256 `27de31f2…`), so it updates in place. Downloaded, checksum verified and installed on an Android 16 emulator. |
| After: iPhone build | https://appdrop.app/d/8g7cx3rw6x | AppDrop link, 0.2.0 (build 2), published 20 Nov; each recipient's iPhone signs it with their own Apple ID. |
| Before | https://github.com/salemkode/xo-react-native-wallet/blob/b32a7fd85674791e557c4bc339da29f3842cf68f/README.md | The starter's README and screenshot; no hosted demo existed before the event. |

## Banner contents

Rendered at the top of the judge page and the web wallet from [banner.json](banner.json):

> **BCH BLAZE 2026** · Deck · Source · What’s new · React Native app built on my open-source Libauth + XO template (before the event: react-native-libauth, xo-react-native-wallet, demo) · EMBER2026: `<address>`

| Banner item | Target |
| --- | --- |
| Deck | https://docs.google.com/presentation/d/1NcDfEq6mmGHIi0OvOzE1qG8dILfKJSs_7BqTaGnA9KI/edit?usp=sharing |
| Source | https://github.com/salemkode/venn-blaze-2026 |
| Before the event: react-native-libauth | react-native-libauth @ ccd225d |
| Before the event: xo-react-native-wallet | xo-react-native-wallet @ b32a7fd |
| Before the event: demo | Its README at b32a7fd |
| What’s new | https://github.com/salemkode/venn-blaze-2026/blob/hackathon/docs/blaze/SUBMISSION.md#built-during-the-event |
| EMBER2026 | `bitcoincash:zzzyq9g0n2ywatt0eajwre5h89aju3kk0svl94s4k9` (the entrant's BLAZE 2025 address, set 20 Nov; the judge page footer shows the same value) |

To change any of these, edit `banner.json` and run `npm run build:blaze`; both pages pick it up.
