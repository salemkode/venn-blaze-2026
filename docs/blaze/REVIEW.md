# Venn · submission review

On 20 November 2026 the near-final deck, demo and BUIDL draft went to three independent reviewers with the same read-only brief and the official rules. Each was asked to challenge the story, the visuals, factual claims and evidence, rule compliance and the track choice.

| Reviewer | Model used | Status |
| --- | --- | --- |
| Lead | Claude Opus 5.5 (this session) | Done |
| Sol | `gpt-6.2-sol` (the current Sol), high effort | Done |
| Astra | `gpt-6.2-astra` (the current Astra), high effort | Done |
| Fable | `claude-fable-5-2`, high effort | Done |

All three agreed on the track: **Mainnet**, with **Build with XO** only if the entrant writes the feedback and accepts the IP waiver; skip Media and Migrate to XO. All three verdicts were “not submittable as it stands”, for reasons that are fixable before the deadline. Fable independently checked 21 transaction IDs on public servers; Sol and Astra cross-checked all 20 IDs against the evidence files. No ID was wrong.

## Findings and what happened

| Finding | Raised by | Outcome |
| --- | --- | --- |
| The judge page footer showed an unconfirmed voting address while the banner said “coming soon” | Sol, Astra, Fable | **Fixed.** The footer now comes from `banner.json`, so both always show the same approved address, or none. The address itself is your decision. |
| The footer “Source code” link opened the private repository | Astra, Fable | **Fixed** in the build: it points to the public judge source. |
| The live site and the public source are stale; the “what’s new” link 404s | Sol, Astra, Fable | **Waiting for your approval** to push the prepared snapshot and redeploy (TODO items 3 and 7). Prepared and tested. |
| No Mainnet payment has gone through the web wallet | Sol, Astra, Fable | **Reworded everywhere** (“verified up to the Mainnet Send screen; paid on Chipnet”). The app now opens on Mainnet. One small payment from your own wallet is TODO item 7a; the agent may not spend Mainnet funds. |
| The wallet opened on Chipnet, so judges had to find the network switch | Fable | **Fixed:** Venn starts on Mainnet; Chipnet stays selectable; existing Chipnet pairings keep their network. Tests added. |
| Recovery claims merged the app's request and stop with a scripted completion on a different Venn | Sol, Astra, Fable | **Fixed** in SUBMISSION, the evidence slide, the benefits notes, the README and the appendix: two separate rows, with `a7a23686` added. |
| “Done on Mainnet” hid that the run was scripted | Sol, Fable | **Fixed:** every Mainnet claim now says “scripted with the app's transaction builders and two test keys”. |
| “All returned” overstated: BCH fees and kept coins were spent | Sol | **Fixed:** “all MUSD returned; about 45,800 sats to fees and coins the contracts keep”. |
| Membership votes were claimed on Chipnet without a receipt | Sol, Astra | **Fixed:** now “tested locally”. |
| The Android APK is Chipnet-only, yet the deck sent judges to the native app | Fable | **Fixed** in the deck, the docs and the web Venns card (“Android preview (Chipnet)”). A Mainnet APK is an optional TODO. |
| The demo script promised an $80 vote and “approve as Sam”, which the judge page cannot do; the widget was not labelled a simulation | Sol, Astra, Fable | **Fixed:** the other thread's redesign (merged 20 Nov) added a real Ask the group → Approve/Decline vote for $80; the build now tags the widget “Simulation”, and DEMO.md and the script use $20 and $80. |
| Slide 3: a 2-of-3 multisig needs two signatures, not three | Astra, Fable | **Fixed.** |
| Slide 2 should lead with the household | Sol, Astra | **Fixed:** “Sara can pay $20 for groceries on her own, but an $80 purchase needs two of the three housemates.” |
| Slide 4 label put a Chipnet claim on iOS-simulator screens | Fable | **Fixed:** two labels, “Tested locally · app screens, iOS simulator” and “Done on Chipnet · same flow on Android”. |
| Slide 5's desktop screenshots were unreadable | Sol, Astra, Fable | **Fixed:** three phone screens of the Mainnet path (Connect, wallet, Send), pairing code blurred. |
| Slide 7 code is a paraphrase | Sol, Fable | **Fixed:** captioned “Simplified excerpt”. |
| Slide 10 labelled the existing XO template “Planned” | Sol | **Fixed:** the bullet now says the template already runs on Chipnet; only its use in the app is planned. |
| Slide 12 hashes were not links | Astra | **Fixed:** every ID links to its explorer. |
| Hidden template text (“TITLE HERE”) could reappear on Google import | Fable | **Fixed:** removed. |
| README still said Venn v1, Chipnet only, pairing unverified | Sol, Astra, Fable | **Fixed.** |
| The XO rule names `0.1.0-next`; the template uses `0.1.1-next`, and the invitations used the previous release | Sol, Astra, Fable | **Disclosed** in ELIGIBILITY; asking General Protocols is a TODO; the agent can re-run one Chipnet payment if needed. |
| The refund used a second envelope | Sol, Astra | **Disclosed** in SUBMISSION and ELIGIBILITY. |
| The “before” demo is a README screenshot | Sol, Astra, Fable | **Open:** no hosted demo existed before the event. Asking the organizers is a TODO. |
| `guide.html` said submissions begin at the deadline | Sol | **Fixed.** |
| “Two internal reviews” should say who | Fable | **Fixed:** “two AI-assisted internal reviews”. |
| The MUSD minting claim is sourced only from the repository | Fable | **Removed** from the deck. |
| `TODO-BEFORE-SUBMIT.md` missing | Astra, Fable | Written after the reviewers' snapshot; present now. |
| No banner on the web wallet at phone widths | Fable | **Not reproduced:** the banner renders at phone width in Safari on an iOS 26 simulator. The reviewer could not render the bundle. |
| Slide 11's mascot covers “THANK YOU” | Sol, Astra | **Kept:** that is the template's own artwork. |
| Twelve slides is long for a couple of minutes | Fable | **Kept:** slides 8–12 are evidence, limitations, vision, close and appendix; the presenter script uses six of them. |

## Lead reviewer's own checks

- Every cited transaction was re-checked on two independent servers per network after the edits (21 IDs, all confirmed on both).
- The web wallet was walked on a phone (Safari, iOS 26 simulator, through Argent): onboarding, Connect, wallet, Send, Receive, Venns and Settings, on Mainnet and Chipnet. Found and fixed: the tab bar (top text pill on the web), Safari's toolbar covering it, long pages pushing it away, an empty Venns tab, an address overflowing its card, a misleading Send hint, a wrong-colour network dot, and the oversized network button.
- Typecheck, lint and 199 app tests pass, plus 37 XO template tests (also on the latest engine). The public snapshot passes the same checks from a clean install.
