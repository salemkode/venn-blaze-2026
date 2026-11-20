# Venn · track eligibility

Rules re-read on 20 November 2026 from the [DoraHacks details page](https://dorahacks.io/hackathon/bchblaze2026/detail), the [schedule](https://bchblaze.com/schedule/) and the [bounties](https://bchblaze.com/bounties/). Submission deadline: **22 November 2026, 14:00 UTC**. Judging runs 23–27 November; results on 28 November.

## Recommendation

**Enter the Mainnet track**; Community Choice follows automatically with the voting address `bitcoincash:zzxajy7s8h5qk0tajmr2rmus40ypcs9csvu8j9wgrd`. The entrant decided on 20 November to **skip the Build with XO bounty**, as well as Media and Migrate to XO.

## Verdicts

| Track | Verdict | What it still needs |
| --- | --- | --- |
| Mainnet | **Reachable before the deadline** | Your approvals: publish the updated source snapshot and redeploy the site, choose the voting address, share the deck read-only. Your confirmation of roll call and the Telegram check-in. |
| Community Choice | **Reachable**, follows Mainnet | Address chosen by the entrant: `bitcoincash:zzxajy7s8h5qk0tajmr2rmus40ypcs9csvu8j9wgrd` (token-aware, checksum verified); it is in the banner, the footer and SUBMISSION.md. |
| Build with XO | **Skipped by decision** (20 Nov) | Would have needed the entrant's own feedback and the IP waiver. The template stays in the repository as part of the project. |
| Media | Not recommended | No media piece exists. A product video is not what this track judges. |
| Migrate to XO | Not realistic | No pre-existing Venn functionality was moved to XO. |

## Mainnet track

What the rules require, and where Venn stands:

| Requirement (DoraHacks) | Status | Evidence |
| --- | --- | --- |
| “At least one feature that involves sending Bitcoin Cash (BCH) mainnet transactions … possible USING the app for anyone (ie the judges) to simply & clearly make a useful BCH mainnet transaction” | Implemented in the web wallet, which now opens on Mainnet: a judge connects their own WizardConnect wallet and sends BCH. Verified on the production web export up to the Mainnet Send screen (pairing, balance, matching address); the same path completed a payment on Chipnet. No Mainnet payment has gone through the web wallet yet; one small owner payment on the deployed build is recommended. | [DEMO.md](DEMO.md#verified-on-20-november), Chipnet `7594e82e…` |
| “A live, usable demo … judges can simply click a website link to open & experiment with” | Live at https://venn.salemkode.com/blaze/ since 19 Nov, but that is the old Chipnet build without the banner; the 20 Nov build awaits redeploy approval. | [LINKS.md](LINKS.md) |
| “Original or significantly improved during the hackathon” | The shared-money product, contracts, app and Mainnet/Chipnet runs were all built 14–20 Nov on top of a send/receive starter. | [SUBMISSION.md](SUBMISSION.md#built-during-the-event) |
| Top-of-page banner on the home page: Widget Factory presentation, source repository, CashTokens address for EMBER2026 | Built on the landing page and the web wallet from `banner.json`. Deck link and voting address pending your decisions. | [banner.json](banner.json) |
| Pre-existing projects: links to old and new repo plus a demo from before the hackathon | Old: xo-react-native-wallet @ b32a7fd (14 Nov 13:55 UTC) and its README screenshot (no hosted demo existed). New: venn-blaze-2026. | [SUBMISSION.md](SUBMISSION.md#pre-existing-work) |
| WizardConnect or XO Template integration | Both: WizardConnect pairing and signing in the web wallet (verified 20 Nov); XO for ordinary payments in the native wallet; an XO template on Chipnet. | Source `src/wallet/relay.ts`, `contracts/xo-allowance/` |
| Individuals or teams of 2–4 | Solo entry; the page says “individuals or teams of 2-4 members”. | — |
| Attended at least one preparation stream (roll call) and confirmed in the BLAZE Telegram | **Unknown: only you know.** Without roll call the entry goes to the low-priority judging queue. | — |
| Registered on DoraHacks and submitted by the deadline | **Unknown:** DoraHacks needs your login. | — |

Risks a judge may raise, and the honest answer:

- The website's Mainnet transaction is an ordinary BCH payment from the judge's own wallet. Venn's distinctive features (budgets, votes, recovery, Circles) need the native app, and the published Android preview is Chipnet-only; their Mainnet transactions came from a script using the app's builders.
- The source repository `salemkode/venn` is private. Judges see the public snapshot `venn-blaze-2026`, which must be refreshed to the presented revision.
- No external audit.

## Community Choice

“All projects that are Eligible for Mainnet Track & Media Track are automatically included … as long as they list a CashTokens address on their project that can receive EMBER2026 tokens.” The entrant chose `bitcoincash:zzxajy7s8h5qk0tajmr2rmus40ypcs9csvu8j9wgrd` (Mainnet, token-aware P2PKH, checksum verified on 20 November). It replaces the earlier footer address `bitcoincash:zp78…paj`, whose origin was never recorded and which is no longer shown anywhere.

## Build with XO (General Protocols, 0.3 BCH each, up to 10 winners): skipped

The entrant decided not to enter. The assessment is kept for the record.

| Requirement | Status |
| --- | --- |
| A novel, functional XO template that correctly implements its contract | Venn Merchant Allowance v3: a capped, paced token payment to a preselected merchant with a timelocked sponsor refund. 37 tests on the BCH 2025/2026 VMs. |
| A transaction on Chipnet or Mainnet using an invitation inspectable in the debug tool; submit the invitation | Payment, follow-up and refund invitations executed on Chipnet 19 Nov; files in `contracts/xo-allowance/evidence/`. |
| Follow-up actions, if applicable | The follow-up payment spends the successor envelope created by the first payment. |
| Template, invitation and reproduction instructions | `contracts/xo-allowance/README.md` (the refund was shown on a second envelope whose refund height had passed) |
| Latest engine (“the latest `0.1.0-next.xxx` release”) | The rule names `0.1.0-next`, but npm's latest `next` is `0.1.1-next.18170561234` (20 Nov); the template is pinned to it and its tests pass. The executed invitations used the previous release, `0.1.1-next.18029697917`. Ask General Protocols which they accept, and re-run one payment on the pinned release if they want matching evidence. |
| Personally written feedback, ~500 words; “AI written submissions will be rejected” | **Placeholder only**: you must write it. |
| IP: “Submissions for a bounty automatically waive their rights over intellectual property or similar” | **Your decision.** The repository is MIT-licensed. |

## Migrate to XO (1 BCH each, up to 5 winners)

The bounty asks to migrate existing functionality to an XO template, with links to the original working project and the XO version. Venn's ordinary payments already used XO before the event (the starter was an XO wallet), and the allowance template is a new contract written during the event rather than a migration of Venn's covenant. Claiming it would be a stretch.

## Media (1,000 PUSD)

The track wants inspirational, engaging BCH media judged by its potential to go viral. Venn has a product walkthrough, not a media piece. Not worth splitting time two days before the deadline.
