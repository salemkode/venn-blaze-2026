# Venn · BCH BLAZE 2026 submission

Prepared 20 November 2026 for the DoraHacks BUIDL form. The deadline is **22 November 2026, 14:00 UTC** (DoraHacks shows 17:00 UTC+3). Items that only the entrant can decide are listed in [TODO-BEFORE-SUBMIT.md](TODO-BEFORE-SUBMIT.md).

| Field | Value |
| --- | --- |
| Name | Venn |
| Team | salemkode, solo entry (confirm against the DoraHacks registration) |
| Tagline (≤ 80 characters) | Shared money with rules everyone signs, enforced by Bitcoin Cash. |
| Track | Mainnet track (Community Choice follows automatically). No bounties. See [ELIGIBILITY.md](ELIGIBILITY.md). |
| EMBER2026 voting address | `bitcoincash:zzxajy7s8h5qk0tajmr2rmus40ypcs9csvu8j9wgrd` |
| Demo | https://venn.salemkode.com/blaze/ (judge page) · https://venn.salemkode.com/ (web wallet) |
| Deck | Widget Factory copy (Google Slides): https://docs.google.com/presentation/d/1NcDfEq6mmGHIi0OvOzE1qG8dILfKJSs_7BqTaGnA9KI/edit?usp=sharing · [PowerPoint](venn-blaze-2026.pptx) · [PDF](venn-blaze-2026.pdf) |
| Source | https://github.com/salemkode/venn-blaze-2026 (pinned revision: https://github.com/salemkode/venn-blaze-2026/tree/faa806c9c85d47dcdf22ce579188e32e648c7c85) |
| Icon | [assets/images/icon.png](../../assets/images/icon.png) (1024×1024) |

## Short description

Venn is a Bitcoin Cash wallet for money people share. Each member spends alone from a budget they agreed to, bigger payments need a group vote, and a lost phone can be replaced after a waiting period. A CashScript covenant and CashTokens enforce the rules on-chain, so nobody holds the money: not the creator, and not us.

## Long description

A shared grocery fund should let someone pay at the till without waiting for every housemate to sign, and still make the group decide together before anyone spends more. Today people choose between trust (one person holds the card) and friction (a multisig that needs everyone for a $20 shop).

With Venn a household, a couple, a team or a savings circle agrees on the rules once. The creator proposes who is in, how much each person can spend per period, which payments need a vote and who can help recover a lost seat. Every rule shows its catch before anyone joins. Each person reads the plan and signs for their own seat; the app builds the Venn only after every member has accepted, and from then on the covenant enforces the funded rules.

The fund lives in a CashScript covenant. CashTokens carry its state: one rules NFT and one mutable card per member with their key, roles and remaining budget. A member's payment must rewrite their card in the same transaction, so the BCH virtual machine refuses overspending. Bigger payments use proposal and approval codes signed by the required seats; no server is involved. Four kinds ship in the native app: Personal, Shared, Pot and Circle (a rotating savings group, or jam’eya, on its own contract). Budgets are in dollars: MUSD on Mainnet, where the app now starts, and Venn Test USD on Chipnet.

On 19 November the contracts ran on Mainnet with real MUSD, driven by a script that uses the app's own transaction builders and two test keys: a Venn was created, a member paid from their budget, the group paid by vote, and a two-member Circle completed both rounds; all MUSD went back to its owner. On Chipnet two wallets in the Android app ran the same flows and requested and stopped a recovery; a script completed one. The website hosts the web wallet, which opens on Mainnet: judges connect their own wallet over WizardConnect and send BCH, signed in their wallet and reviewed in Venn before broadcast. A standalone XO template, the Merchant Allowance, applies the allowance idea to a capped, paced payment to a shop.

Venn is an alpha. The contracts have had internal reviews but no external audit, and creating or paying from a Venn needs the native app; the website handles ordinary payments with a connected wallet.

## Pre-existing work

**Venn is a React Native app built on my open-source Libauth + XO template** (before the event: react-native-libauth, xo-react-native-wallet).

Venn was built on the author's earlier **React Native + Libauth + XO template**: two public repositories created on 13 November, before hacking began on 14 November at 14:00 UTC. [xo-react-native-wallet](https://github.com/salemkode/xo-react-native-wallet) is the XO React Native wallet template (send, receive, Chipnet/Mainnet switch, XO primitives), and [react-native-libauth](https://github.com/salemkode/react-native-libauth) is the native Libauth adapter it runs on. Everything listed under “Built during the event” was added on top of that template.

| What | Before the event | Notes |
| --- | --- | --- |
| XO React Native wallet template (send, receive, Chipnet/Mainnet switch) | [xo-react-native-wallet @ b32a7fd](https://github.com/salemkode/xo-react-native-wallet/tree/b32a7fd85674791e557c4bc339da29f3842cf68f), committed 14 Nov 13:55 UTC; [13 Nov state @ ba90bd0](https://github.com/salemkode/xo-react-native-wallet/tree/ba90bd04f9f4db52ce30b2cef69f662efbb32482) | Its README with screenshot is the pre-event demo. There was no hosted demo before the event. |
| Native Libauth adapter used by the template | [react-native-libauth @ ccd225d](https://github.com/salemkode/react-native-libauth/tree/ccd225d749b55980612b44515bf47302e8b6b70c), repository created 13 Nov 11:06 UTC, last pre-event commit 14 Nov 13:52 UTC | Vendored as `modules/libauth-native`. |
| Libraries | Expo, React Native, libauth, CashScript, XO Engine, WizardConnect | Third-party, see [LICENSE](../../LICENSE) and package.json. |

The Venn repository was created on 17 November. Work between kickoff and 17 November happened in local checkouts and was imported as the first commit, `6eceb15` ("Checkpoint Venn source alpha").

## Built during the event

All dates are 2026, times UTC.

| Date | Work |
| --- | --- |
| 14–17 Nov | Venn v1 contract, invitations with seat-specific signed acceptance, Venn creation and budget payments, native wallet screens, contract tests (imported at `6eceb15`, 17 Nov 18:53). |
| 17 Nov | Judge walkthrough, first BLAZE brief, test pruning. |
| 18 Nov | Every screen redesigned; Create a Venn as swipeable cards; contracts hardened into **Venn v2** and the **Circle** contract added; voting, recovery, Pot and Circle shipped in the app; two internal contract reviews closed; XO allowance template v3 with paced payments. |
| 19 Nov | Venn v2 and Circle run live on Chipnet from the app on an Android emulator and from scripts, including a completed recovery; broadcasts relayed to every server; Venn v1 removed; XO allowance v3 executed on Chipnet; Mainnet network switch with confirmation; WizardConnect hardening; **Venns and Circles run on Mainnet with MUSD**; landing page rewritten; Android preview signed. |
| 20 Nov | **Venn starts on Mainnet** (Chipnet stays selectable; existing Chipnet pairings keep their network); web wallet rebuilt to look like the phone app (bottom tab bar, phone frame on desktop, Safari toolbar fix, Venns explainer, wrapping addresses);  BLAZE banner on the landing page and the wallet; connected-wallet activity nets the receive and change branches (a payment no longer reads as the whole coin); clear message and Change network action for a wallet on the other network; XO engine bumped to the latest `next`; hosted web build verified end to end with Cashonize (Chipnet payment `7594e82e…`); this submission package and the deck. |

## Evidence

Every transaction below was re-checked on 20 November (21 IDs) on two independent Electrum servers per network (Mainnet: bch.imaginary.cash and fulcrum.greyh.at; Chipnet: chipnet.imaginary.cash and chipnet.bch.ninja); all were confirmed on both. Mainnet explorer: `https://explorer.bitcoinunlimited.info/tx/<id>`. Chipnet explorer: `https://chipnet.imaginary.cash/tx/<id>`.

| Claim | Label | Transaction ID or test | How to verify |
| --- | --- | --- | --- |
| A Venn v2 holding 0.60 MUSD was created (contract fingerprint 6d22393b). All Mainnet rows: scripted with the app's transaction builders and two test keys | Done on Mainnet | `40bdcea8d2a8dd44564f204afa433f77733047fbb479a02d4eb02a8f5e184b33` | Explorer; [live-mainnet-2026-11-19.md](../live-mainnet-2026-11-19.md) |
| A member paid 0.10 MUSD alone from their budget | Done on Mainnet | `c9bfc422bcff62299d17f46d45b1476d19aae0fb42e5266298b1f9a709c8a6f4` | Explorer |
| The group paid 0.50 MUSD by vote (proposal and approval codes) | Done on Mainnet | `adb33e9aaa54a80c32a8d0ca989cdacc72b085c3dd1ca97231d0a972b720e482` | Explorer |
| A two-member Circle completed both rounds | Done on Mainnet | genesis `c593a2d3e57f1e06b43833cb0274b7ec38dc6a3d5c0d742648780af7771344d6`, payouts `9c57cb300286c362a23b820cc79e6bd964118e52f8270874d207716115d99307`, `b3536e30d4befe85122363feade4b8f8261f216d7866e9b50382f5ed04c64a13` | Explorer |
| All MUSD went back to its owner; about 45,800 sats (≈ $0.09) went to fees and coins the contracts keep | Done on Mainnet | `aa6a39c0eb805aeedceecfb51e032e06b81e17c667fdeef1984463c11cc53e76`, `97b35d40df4839e5b62f846712b1a835bb5ccc99ea1f74321311e9cea7949d31` | Explorer |
| Two wallets in the Android app created a Personal Venn and a Shared Venn | Done on Chipnet | `c37b95308415a85cd0816f87b516ad0f9f9a69461cd10074228680eaa69a93a4`, `f464fc58723e4c1863a7640db6f03a4e096f6d9915d53ddd5c1fc3de0c1502e3` | Explorer; [live-chipnet-2026-11-19.md](../live-chipnet-2026-11-19.md) |
| A two-signer payment vote passed between two wallets | Done on Chipnet | `327937016f413d699646c5666f07e9cbcde1a63f7d9b641d25c83345a1aa4acb` | Explorer |
| A Circle round paid out from the app | Done on Chipnet | `10fa0a5e2ea7e521b701a9dc53b2821adce68bdabf9c7830960f79c02650b291` | Explorer |
| In the app: a helper requested a seat recovery and the old key stopped it | Done on Chipnet | `0d117273316003d3cc2951993fee9e088e162d7911e9bee690d44e7fb131fcca`, `4a040ff59bf3d983899421441c69f2f043791b99f6d0b97873195959869cb40c` | Explorer |
| Scripted (separate Venn): two helpers approved a recovery and the new key took the seat after the wait | Done on Chipnet | `a7a2368615e7c5111d630b798ae9964485a5cec264a14de29134ef6933972b18`, `d2b69db5554422a105572969df3284a06b051e704ccb8b1c4ea759b5133fa851` | Explorer |
| The production web build paired a fresh Cashonize wallet over WizardConnect and sent a payment it signed; Venn broadcast after its review | Done on Chipnet | `7594e82ee1193e59b13cb085e10bd5c2a7381f64d15425c9f065456fc802bf4e` (20 Nov, self-payment of 0.0002 tBCH) | Explorer; [DEMO.md](DEMO.md#verified-on-20-november) |
| The deployed web wallet (venn.salemkode.com) paired the owner's Cashonize wallet over WizardConnect on Mainnet, showed its balance, and sent 0.0001 BCH after Cashonize approved and Venn's own review | Done on Mainnet | `a018ad740448ce69d6c1402fee11a53400886c3a5f8a2f6d4254f0d0301c7409` (20 Nov, accepted by two Mainnet servers) | [DEMO.md](DEMO.md#verified-on-20-november) |
| **From the Android app 0.2.0, on Mainnet** (two wallets on one emulator, funded from the owner's Cashonize): a Shared Venn with 0.50 MUSD was created after the second member accepted their seat | Done on Mainnet | `618c2e9dad65dafc6ac3353514512bcd4f81e2ce03d436808f63e10a8f2acb7c` | Explorer |
| Same Venn, in the app: a 0.30 MUSD payment over the member's 0.20 budget was refused before signing; 0.10 MUSD paid alone from the budget | Done on Mainnet | `54288429411705f709236aae47ced339c3933d72f0cef3e317cfadd2ff518960` | Explorer |
| Same Venn, in the app: the member proposed 0.30 MUSD beyond the budget, the other member approved with a code, and it was paid (2 of 2) | Done on Mainnet | `ea2bfec69906012c54f74a65af12175621f7700d1bd60aae63eccdf1846edda0` | Explorer |
| XO Merchant Allowance v3: genesis, capped payment, follow-up from the successor; sponsor refund on a second envelope; payments before the interval refused | Done on Chipnet | `2f609c88b79efff22c1d6bbeefa6eea6ef2c86ed1028b893c9073a0d4f45ddc5`, `8b5f1cc7998d33f52c388281f587813459b24222bab3fef2c798efc883c96c5f`, `a05e6cea2dc60a35b694d271bff2a06737afe23751bde096dce18255e0f60e9f`, `39b4167c973a43030bdecd2b8c4d455c190759bf7c32ab17eaf5e02fee33c6d7` | [contracts/xo-allowance/README.md](../../contracts/xo-allowance/README.md); invitations open in the XO debugger |
| One cent over a budget is rejected by the BCH VM; contract paths for votes, membership changes, recovery and Circle | Tested locally | `npm test`: 201 tests pass; `cd contracts/xo-allowance && npm test`: 37 pass (also on the latest XO engine) | Run from a checkout; typecheck and lint also pass |
| The landing page "grocery fund" lets visitors try budgets and votes | Simulated | JavaScript in the page; no chain access | Open https://venn.salemkode.com/blaze/ |
| External audit; Venns created and paid in the browser; Mainnet recovery and membership votes | Planned | — | — |

## Banner

The landing page and the web wallet carry a top-of-page banner built from [banner.json](banner.json): the deck, the source, the pre-event source and demo, a link to the "Built during the event" section above, and the EMBER2026 CashTokens address `bitcoincash:zzxajy7s8h5qk0tajmr2rmus40ypcs9csvu8j9wgrd`. The deck link opens the Google Slides copy, shared as Anyone with the link: Viewer.
