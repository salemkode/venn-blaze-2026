# Before you press Submit

**Deadline: Sunday 22 November 2026, 14:00 UTC** (17:00 Aden, as DoraHacks shows it). Aim to submit by **Saturday 21 November, 20:00 UTC** to leave margin. The Final Check-In stream is **Saturday 21 November, 14:00 UTC**.

Everything not listed here is done and merged into `master` of the private repository. The public source, the site, the Android APK, the iPhone build and the BUIDL are all live.

## In order

| # | What | Who | Why it matters |
| --- | --- | --- | --- |
| 1 | **Confirm registration, roll call and Telegram.** Check that your DoraHacks account is registered for BCH BLAZE 2026, that you attended at least one preparation stream (roll call), and that you confirmed the project in the BCH BLAZE Telegram. | You | Required for the Mainnet track; without roll call the entry is judged in the low-priority queue. |
| 2 | ~~Choose the EMBER2026 voting address.~~ **Done 21 Nov:** `bitcoincash:zzxajy7s8h5qk0tajmr2rmus40ypcs9csvu8j9wgrd`, Venn's own address (each entry has its own; checksum verified), now in both banners, the judge-page footer and SUBMISSION.md. | You | — |
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
| Voting address everywhere public | One address on the site, the in-app banner, the public source and the BUIDL; the deck has none (changed to Venn's own address on 21 Nov) | — |
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

## Overnight QA, round 2 (21 November): remaining flows on Mainnet

All from the Android app 0.2.0 on emulator-5554 with four local test wallets (You, Sam, Lee, a “new phone”), funded only by the earlier test coins plus 0.05 MUSD from your Cashonize. Every txid below was accepted by two Mainnet servers.

| Flow | Result | Mainnet txids |
| --- | --- | --- |
| Membership vote: add Lee to the Shared Venn (You proposes, Sam approves, 2 of 2) | Done; rules now read “2 of 3 voters” | `69cc59ec46f38b07ce311c36f365012379b40bf5fa5cb7de8647364350ea375d` |
| Recovery: You (helper) requests a new key for Sam's seat | Done; the app shows “New key 8bff2521… takes over about 168 hours after the request confirmed. Until then the seat cannot spend or vote.” Request confirmed in block 978217 at 2026-11-20 22:50:46 UTC, so it would have completed at **2026-11-27 22:50:46 UTC** | `6c6017d92e66c73991a32f205cca9cd3f6e51e7167a127000c2960bf7cad32ae` |
| Recovery stopped by vote (this Venn's rules don't let the old key stop it; You proposes, Lee approves, 2 of 3) | Done; the waiting notice is gone | `8f171bb83288034c70ffae314fd27b87c7a691646df26163fdfe6b669bf57c54` |
| Personal Venn (You + Sam as friend), 0.10 MUSD | Created, then You paid the 0.10 MUSD alone back to your Cashonize | fee coin `5424f8e7feaeb35af584f7491116c1a3ae96fd82b2e7260317c6ac5f65e67604`, create `9c4b8d3b1dcf6ecc092015d8376f37f0b1ed02657f90f784f61e850819d2eb64`, payout `7c83610d85bd1ade4f04d59e39c731d6a7611a792cd4ba992173f71544c7b8fb` |
| Pot Venn (You + Sam), 0.05 MUSD from your Cashonize | Created; paid back to your Cashonize by a 2-of-2 vote | top-up `eb2241ccb51cf99aedb9148a140d2eadba8633a83607d4336c26faf59a456f05`, fee coin `07d4525f61ebf6cab6411bf6e37b8dd691325d2fbe64483bcde3cdaef6ebd3c0`, create `16432f9e22c00c3ca7e4dbf247430a48152650377e282b46891b0455fd251744`, payout `5532d72c17220f23cc1602b526f569543e735d90d433022079648c1f647cb3d6` |
| Circle | **Not created on Mainnet tonight, on purpose:** each payout lands on a member's Venn key, and the 0.05 MUSD contributions would then stay on emulator keys (the new “Move to this wallet” moves BCH only, not MUSD). A two-member Circle already completed on Mainnet on 19 Nov (scripted) and in the app on Chipnet. | — |
| New: “Move to this wallet” on the fee balance screen | Built, tested and used: the Venn keys' BCH went to each wallet's own address, then to your Cashonize with the ordinary Send | You `b7397d9c451f2bf8bb3b5ccbc031225447fe8b19c90643121a984c3a3682751c` → `319877b23bdcf3a78cf2a87918422bce00b1ed89b11800888f1baaa8447a23aa`; Sam `53d4e15e0d191b03302320a2fd4a97c8744dfbf44e6f67852e4bdbb7c93220a2` → `37912d607f746f2254b438a3114a469ecc6c1a8f404920fcacc6310d42641051` |

| After deploying the wallet failover (Worker `ff895c5e`): a WizardConnect payment from the hosted site's desktop frame | Cashonize signed, Venn broadcast through the new client | `c07c53f8b25b293bc9bc4d6831af51eb8565c2aaa483430aa5b5bd6bd440b1cc` |
| Android after the fix: Sam's confirmed payment no longer stays “Payment needs checking” | Cleared; Send and wallet switching work | `37912d607f746f2254b438a3114a469ecc6c1a8f404920fcacc6310d42641051` |

| Demo video (recorded with Argent on emulator-5554, 79 s): over-budget refusal, payment alone, payment by vote | Hosted at https://venn.salemkode.com/blaze/venn-mainnet-demo.mp4 and set as the BUIDL's video | deposit `95627f94950ab3acd02c38394a53f8a276d823e64a82b3698e602c1a0ccdc336`, alone `aee01e645daeecf6367786ddeaa61e4163c14b61d65f64db67ffb3a80b50d7c0`, by vote `a1045b78606179527ca45c9730221213963527ab551679e0c8eceb49818e05d5` |

**Returned to your Cashonize:** all test MUSD (Cashonize shows 1.01 MUSD again) and 0.00219 + 0.00151 BCH. Net BCH cost across both rounds, including fees and the small coins the empty Venns' contracts keep: about 0.0013 BCH (under the 0.005 BCH cap). All four test wallets and both Venn keys are now at 0 (checked on a Mainnet server).

**Found and fixed in this round** (all rebuilt and republished as 0.2.0; APK checksum verified after download):

- **Wallet stuck on “Payment needs checking”** after a confirmed payment (Send and wallet switching blocked): the wallet library drops its own pending record during a refresh, so the check never found it. The app now looks the payment up and clears it.
- **Single Mainnet Electrum server:** the wallet now uses six Mainnet servers (each checked against block 900000) with a retry on the next server for reads; broadcasts are never retried. Checked against live servers with the first one unreachable.
- **Proposals over 5,000 characters could not be pasted on Android 15+** (the recovery-stop proposal was 5,116): code fields now set an explicit limit.
- Added members showed as “Member 3”; the app now keeps the name the proposer gave. Hints pointed to “Settings → Venn key”, which doesn't exist.
- An empty Venn said “You've used your allowance”.

~~**Still open:** a member who is added later must use “Follow a Venn for a new key”…~~ Fixed on 21 November (PR #23): Join a Venn takes the Venn code, and members low on BCH see an “Add BCH for fees” prompt.

### Still open (with evidence)

- ~~Funds left on the emulator's test keys.~~ Returned in round 2 (see above).
- ~~Single Mainnet Electrum server in the wallet library.~~ Fixed in round 2. Original note: `react-native-xo` uses only `electrum.imaginary.cash` on Mainnet; the first launch on an overloaded emulator showed “Electrum connection failed.” once, and it recovered after a network switch. The emulator's own browser reached all five Mainnet servers. No failover yet.
- **iPhone build not run on a physical iPhone.** AppDrop re-signs with each recipient's Apple ID; the identical Release build was verified only on a simulator.
- **Not exercised on Mainnet in the app tonight:** recovery and membership votes (Chipnet and tests only).

## 21 November: returning visitors, own voting address, judge flow

| Change | PR | Deploy / release |
| --- | --- | --- |
| Returning visitors saw a blank screen: the wallet library rejected a `listunspent` reply over 200 coins, and the error unmounted the wallet screens. Token coins are now trimmed from large lists, the first refresh can fail without closing the wallet, and the app moves to the tabs only once. | #19, #20 | Worker deployed; checked with a saved wallet and with a fresh visitor |
| Venn has its own EMBER2026 voting address `bitcoincash:zzxajy7s8h5qk0tajmr2rmus40ypcs9csvu8j9wgrd` on every surface (each entry has its own). | #21 | Worker `56deb275`; BUIDL saved and checked logged out |
| “Try a Venn in your browser” at https://venn.salemkode.com/try uses play money and the real BCH 2026 VM. It covers create, pay within the budget, an overspend refused by `require(sent <= available);` (VennVault.cash line 230), and close and refund. It is linked first on /blaze and in the BUIDL's “JUDGES IN 2 MINUTES”. | #22 | Worker `2daec694` |
| Join a Venn accepts a Venn's code (added members). Members low on BCH for fees see a prompt and a top-up path. | #23 | APK `bb086ddf`, AppDrop 6, Worker `d78fc4d5` |
| `/android` redirects (302) to the signed APK | #24 | Worker `1379c5eb` |
| Household QA fixes: unstoppable two-voter recovery (app-side guard, warning, fixing vote), stale proposals (fresh reads, Refresh and re-propose), automatic refresh, success after create, z-address BCH sends, Max, long-code QR. Still open: copy-paste round trips, the two balances, no Venn history. See SUBMISSION.md, “Known limitations”. | #25 | see the report |

## Fields that need your answer or an organizer's

- Team name as registered on DoraHacks (the docs say “salemkode, solo entry”).
- Whether the BUIDL form asks for a video, a separate pre-existing-work field or the voting address in its own field.
- Whether the organizers accept the starter's README screenshot as the “demo before the hackathon” (no hosted demo existed). Two reviewers flagged this; asking in the BLAZE Telegram settles it.

## Optional, if time allows

- A new 2–3 minute video (item 8).

## Coordination

- Another thread (“Last Project Change”) has uncommitted landing-page edits in the main checkout (`feat/venn-contracts-v2`, older than `master`). This branch does not touch `docs/blaze/landing.html`, `site.css` or `site.js`; the banner is injected by the build. Merge their work before the final deploy if you want it live.
- To merge this branch: open a pull request from `docs/blaze-final-submission` into `master` (not done; nothing pushed).
