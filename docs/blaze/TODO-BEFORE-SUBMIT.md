# Before you press Submit

**Deadline: Sunday 22 November 2026, 14:00 UTC** (17:00 Aden, as DoraHacks shows it). Aim to submit by **Saturday 21 November, 20:00 UTC** to leave margin. The Final Check-In stream is **Saturday 21 November, 14:00 UTC**.

Everything not listed here is done and merged into `master` of the private repository. The public source, the site, the Android APK, the iPhone build and the BUIDL are all live.

## In order

| # | What | Who | Why it matters |
| --- | --- | --- | --- |
| 1 | **Confirm registration, roll call and Telegram.** Check that your DoraHacks account is registered for BCH BLAZE 2026, that you attended at least one preparation stream (roll call), and that you confirmed the project in the BCH BLAZE Telegram. | You | Required for the Mainnet track; without roll call the entry is judged in the low-priority queue. |
| 2 | ~~Choose the EMBER2026 voting address.~~ **Done 20 Nov:** `bitcoincash:zzzyq9g0n2ywatt0eajwre5h89aju3kk0svl94s4k9`, the address from your BLAZE 2025 entry (checksum verified), now in both banners, the judge-page footer and SUBMISSION.md. | You | — |
| 3 | ~~Publish the source.~~ **Done 20 Nov:** https://github.com/salemkode/venn-blaze-2026 branch `hackathon` at `faa806c` (balances removed from the Mainnet run doc). | — | — |
| 4 | ~~Google Slides import.~~ **Done 20 Nov** by Sol: https://docs.google.com/presentation/d/1NcDfEq6mmGHIi0OvOzE1qG8dILfKJSs_7BqTaGnA9KI/edit (private). | — | — |
| 5 | ~~Share the deck.~~ **Done 20 Nov:** Anyone with the link, Viewer. | — | — |
| 6 | ~~Deck link and address in banner.json.~~ **Done 20 Nov**, rebuilt and redeployed. | — | — |
| 7 | ~~Redeploy the site.~~ **Done 20 Nov:** https://venn.salemkode.com runs the 20 Nov build (version `5910b292`), checked in phone Safari: banner with your address, Mainnet by default, phone layout. | — | — |
| 7a | ~~Make one small Mainnet payment on the deployed site.~~ **Done 20 Nov (overnight QA, with your authorization):** venn.salemkode.com paired your Cashonize wallet and sent 0.0001 BCH to its own address: `a018ad740448ce69d6c1402fee11a53400886c3a5f8a2f6d4254f0d0301c7409`. | — | — |
| 8 | Optional: record a 2–3 minute video with the [demo script](DEMO.md#demo-script-2-minutes-30-seconds) if the BUIDL form asks for one. Keep pairing codes off screen. | You or agent | The existing 68-second video shows the older prototype. |
| 9 | ~~Build with XO~~ **Skipped by decision, 20 Nov.** | You | — |
| 10 | ~~DoraHacks BUIDL.~~ **Done 20 Nov:** https://dorahacks.io/buidl/51333 (existing salemkode BUIDL, Mainnet Track, listed on the Builds grid) updated with the Venn icon, tagline, description, deck, source, wallet links and the voting address; checked logged out. Edits stay possible until the deadline. | — | — |
| 11 | Check the BUIDL still shows on the [Builds grid](https://dorahacks.io/hackathon/bchblaze2026/build) under Mainnet Track before 22 Nov 14:00 UTC; if DoraHacks shows a separate final Submit for the hackathon, press it. | You | — |

## Overnight QA, 20–21 November (coordinator request; owner asleep)

| Tested | Result | Transaction IDs (Mainnet) |
| --- | --- | --- |
| Voting address everywhere public | Only `bitcoincash:zzzyq9g0n2ywatt0eajwre5h89aju3kk0svl94s4k9` on the site, the in-app banner, the public source, the BUIDL; deck has none | — |
| Hosted web wallet + Cashonize over WizardConnect, Mainnet payment | Paired, approved in Cashonize, reviewed in Venn, broadcast | `a018ad740448ce69d6c1402fee11a53400886c3a5f8a2f6d4254f0d0301c7409` |
| Same, after the phone-frame fix was deployed (Worker `4beca696`), from the desktop phone frame | Cashonize showed the request, Venn reviewed and broadcast | `a92b51dcf305bf96c3438b3028a1ec0de90d0b738ac16ee746eb944f6cc99ccd` |
| Declining in Cashonize | Venn shows “User rejected the transaction”, nothing sent | — |
| Re-pairing the same wallet after its tab closed | **Was broken** (refused, payments hung on “Approve in Cashonize…”); **fixed** and tested | — |
| Desktop phone frame | **Was broken** since the 20 Nov Safari fix (script did not parse; full-width wallet on desktop); **fixed**, build now checks it | — |
| Android APK | Rebuilt from master as **0.2.0 / versionCode 2**, opens on Mainnet, same certificate; release asset and `.sha256` replaced, downloaded and installed on emulator-5554 | — |
| iPhone | Unsigned Release IPA on **AppDrop**: https://appdrop.app/d/8g7cx3rw6x (0.2.0); the same build signed to run locally opens on an iOS 26 simulator, creates a wallet and loads Mainnet | — |
| Android, Mainnet: fund two app wallets from Cashonize | 0.60 MUSD + 0.004 BCH to the creator's Venn key, 0.001 BCH to the member's | `297674fa472f3b3337c46119bef00c74048608f0bd39827e801b38a37fc20333`, `7e1c09b2c0797fe4577b9318b6371d878fe401c49a8ba414eece498f44543136`, `847fcf9109ad34ee591b849661e36d38fd55938dea0b6cbd41e52330f4973387` |
| Android, Mainnet: create a Shared Venn (member joins with an invitation and accepts a seat) | Created with 0.50 MUSD | `618c2e9dad65dafc6ac3353514512bcd4f81e2ce03d436808f63e10a8f2acb7c` |
| Over-budget payment (0.30 > 0.20 budget) | Refused in the app before signing | — |
| Within-budget payment, 0.10 MUSD to your Cashonize | Sent | `54288429411705f709236aae47ced339c3933d72f0cef3e317cfadd2ff518960` |
| Vote: member proposes 0.30 MUSD, other member approves (2 of 2) | Sent to your Cashonize | `ea2bfec69906012c54f74a65af12175621f7700d1bd60aae63eccdf1846edda0` |
| Creator pays the last 0.10 MUSD to your Cashonize | Sent | `852f477aa850839a796bdbb0e0e03ef1af81fb78cc6f880c03cf5f2ce96dc093` |
| Layout re-test: 0.05 MUSD deposit from Cashonize, paid back through the review | Receive/Pay row now correct after a payment | deposit `05bc8ffd9944d7dfda53220b46772ebf986fc0d08684bc553fb95037294f2b17`, payback `b90545982993df84b82a16f3ac14016be982108dcd07407cbf7646034dce2471` |
| Look and feel | Desktop and phone widths checked; fixed: desktop frame, Android Receive button squashed after a payment, “Chipnet” shown on Mainnet reviews/approvals/proposal form/Circle, “Venn Test USD” on a Mainnet card, “yours to spend” above what the Venn holds, Settings version | — |

### Still open (with evidence)

- **Funds left on the emulator's test keys.** The app has no way to send money out of a Venn key, and the agent will not extract a recovery phrase. Left: creator Venn key `bitcoincash:qzd04y8dx3asw73grjx5h3arzzht6q7vlv92x40qh7` 358,053 sats + 0.10 MUSD; member Venn key `bitcoincash:qp55s3lv0nrwljuls3smqnssmrw4rdas2g2f7350xq` 102,148 sats (about 0.0046 BCH + 0.10 MUSD, roughly $0.98). All other MUSD (0.50) is back in your Cashonize. A “send from Venn key” feature would return it.
- **Single Mainnet Electrum server in the wallet library.** `react-native-xo` uses only `electrum.imaginary.cash` on Mainnet; the first launch on an overloaded emulator showed “Electrum connection failed.” once, and it recovered after a network switch. The emulator's own browser reached all five Mainnet servers. No failover yet.
- **iPhone build not run on a physical iPhone.** AppDrop re-signs with each recipient's Apple ID; the identical Release build was verified only on a simulator.
- **Not exercised on Mainnet in the app tonight:** recovery and membership votes (Chipnet and tests only).

## Fields that need your answer or an organizer's

- Team name as registered on DoraHacks (the docs say “salemkode, solo entry”).
- Whether the BUIDL form asks for a video, a separate pre-existing-work field or the voting address in its own field.
- Whether the organizers accept the starter's README screenshot as the “demo before the hackathon” (no hosted demo existed). Two reviewers flagged this; asking in the BLAZE Telegram settles it.

## Optional, if time allows

- A new 2–3 minute video (item 8).

## Coordination

- Another thread (“Last Project Change”) has uncommitted landing-page edits in the main checkout (`feat/venn-contracts-v2`, older than `master`). This branch does not touch `docs/blaze/landing.html`, `site.css` or `site.js`; the banner is injected by the build. Merge their work before the final deploy if you want it live.
- To merge this branch: open a pull request from `docs/blaze-final-submission` into `master` (not done; nothing pushed).
