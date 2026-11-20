# Before you press Submit

**Deadline: Sunday 22 November 2026, 14:00 UTC** (17:00 Aden, as DoraHacks shows it). Aim to submit by **Saturday 21 November, 20:00 UTC** to leave margin. The Final Check-In stream is **Saturday 21 November, 14:00 UTC**.

Everything not listed here is done and committed on the local branch `docs/blaze-final-submission` (worktree `~/.t3/worktrees/venn/blaze-final`). The source is published and the site is deployed (20 November); nothing has been shared on Google or submitted on DoraHacks.

## In order

| # | What | Who | Why it matters |
| --- | --- | --- | --- |
| 1 | **Confirm registration, roll call and Telegram.** Check that your DoraHacks account is registered for BCH BLAZE 2026, that you attended at least one preparation stream (roll call), and that you confirmed the project in the BCH BLAZE Telegram. | You | Required for the Mainnet track; without roll call the entry is judged in the low-priority queue. |
| 2 | ~~Choose the EMBER2026 voting address.~~ **Done 20 Nov:** `bitcoincash:zzxajy7s8h5qk0tajmr2rmus40ypcs9csvu8j9wgrd` (checksum verified), now in both banners, the judge-page footer and SUBMISSION.md. | You | — |
| 3 | ~~Publish the source.~~ **Done 20 Nov:** https://github.com/salemkode/venn-blaze-2026 branch `hackathon` at `faa806c` (balances removed from the Mainnet run doc). | — | — |
| 4 | ~~Google Slides import.~~ **Done 20 Nov** by Sol: https://docs.google.com/presentation/d/1NcDfEq6mmGHIi0OvOzE1qG8dILfKJSs_7BqTaGnA9KI/edit (private). | — | — |
| 5 | ~~Share the deck.~~ **Done 20 Nov:** Anyone with the link, Viewer. | — | — |
| 6 | ~~Deck link and address in banner.json.~~ **Done 20 Nov**, rebuilt and redeployed. | — | — |
| 7 | ~~Redeploy the site.~~ **Done 20 Nov:** https://venn.salemkode.com runs the 20 Nov build (version `5910b292`), checked in phone Safari: banner with your address, Mainnet by default, phone layout. | — | — |
| 7a | **Make one small Mainnet payment yourself** on the deployed site (a few cents from your own WizardConnect wallet to yourself), then send the transaction ID so it goes into SUBMISSION.md and slide 5. All three reviewers asked for it: nothing has paid through the web wallet on Mainnet yet, and the agent may not spend Mainnet funds. | **You (Mainnet transaction)** | Proves the judge's exact path on the real network. |
| 8 | Optional: record a 2–3 minute video with the [demo script](DEMO.md#demo-script-2-minutes-30-seconds) if the BUIDL form asks for one. Keep pairing codes off screen. | You or agent | The existing 68-second video shows the older prototype. |
| 9 | ~~Build with XO~~ **Skipped by decision, 20 Nov.** | You | — |
| 10 | **DoraHacks BUIDL.** Log in, check for an existing Venn draft (do not create a duplicate), fill it from [SUBMISSION.md](SUBMISSION.md), link it to BCH BLAZE 2026 and the Mainnet track, attach the icon, demo, deck and source links. | You (login), agent can fill once logged in | — |
| 11 | **Press Submit**, then confirm the BUIDL shows as submitted to BCH BLAZE 2026. | **You (approval point)** | — |

## Fields that need your answer or an organizer's

- Team name as registered on DoraHacks (the docs say “salemkode, solo entry”).
- Whether the BUIDL form asks for a video, a separate pre-existing-work field or the voting address in its own field.
- Whether the organizers accept the starter's README screenshot as the “demo before the hackathon” (no hosted demo existed). Two reviewers flagged this; asking in the BLAZE Telegram settles it.

## Optional, if time allows

- A Mainnet build of the Android preview: the published APK (19 November) is Chipnet-only. Building and publishing a new APK is a public release, so it needs your approval.
- A new 2–3 minute video (item 8).

## Coordination

- Another thread (“Last Project Change”) has uncommitted landing-page edits in the main checkout (`feat/venn-contracts-v2`, older than `master`). This branch does not touch `docs/blaze/landing.html`, `site.css` or `site.js`; the banner is injected by the build. Merge their work before the final deploy if you want it live.
- To merge this branch: open a pull request from `docs/blaze-final-submission` into `master` (not done; nothing pushed).
