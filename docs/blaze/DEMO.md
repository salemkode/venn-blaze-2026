# Venn demo

| | |
| --- | --- |
| Judge page | **https://venn.salemkode.com/blaze/** |
| Web wallet | **https://venn.salemkode.com/** (opens on Mainnet; on a desktop it appears inside a phone frame, on a phone it runs full-screen) |
| Android app | Signed preview APK 0.2.0 on the [judge source releases](https://github.com/salemkode/venn-blaze-2026/releases/tag/blaze-2026-android-preview) (built 20 November; opens on Mainnet) |
| iPhone app | [AppDrop](https://appdrop.app/d/8g7cx3rw6x) (0.2.0; signed on your iPhone with your own Apple ID) |
| Video | **[79-second Mainnet demo](https://venn.salemkode.com/blaze/venn-mainnet-demo.mp4)** (21 Nov, Android app 0.2.0 on Bitcoin Cash Mainnet): a Shared Venn, a 0.30 MUSD payment refused over budget, 0.10 MUSD paid alone (`aee01e645daeecf6367786ddeaa61e4163c14b61d65f64db67ffb3a80b50d7c0`), 0.25 MUSD proposed and paid after a second member approved (`a1045b78606179527ca45c9730221213963527ab551679e0c8eceb49818e05d5`), shown on the 3xpl explorer. The older [68-second walkthrough](walkthrough.mp4) shows the earlier BCH-denominated prototype. |

The live site runs the 20 November build (deployed 20 November, checked in phone Safari).

## Judge instructions (about two minutes)

**You need:** a WizardConnect wallet with a little BCH, for example [Cashonize](https://cashonize.com) with a few cents.

1. Open **https://venn.salemkode.com/**. Skip the intro and choose **Connect a wallet**. Venn is on Mainnet (“● Mainnet · real BCH”).
2. In your wallet, connect with the `wiz://` link or QR (Cashonize: **Connect**, paste, **Connect New dApp**, **Connect**). Venn shows your balance and receive address.
3. Choose **Send**, enter an address you control and a small amount, then **Review payment**. Approve in your wallet. Venn shows the recipient, amount, network fee and total; choose **Confirm and send real BCH**. Venn shows the transaction ID with a **View** link.
4. Optional: open **https://venn.salemkode.com/blaze/** for the story. Its grocery fund is a **simulation** that explains the rules: pay **$20** (from your own budget), then **$80** (over budget: **Ask the group**, then approve as Sam or Lee; two of three pay it from the fund).

Venn never holds your key: the connected wallet signs, and Venn broadcasts only after its own review screen. Shared Venns (budgets, votes, recovery, Circles) need a recovery phrase on the phone, so they run in the native app; the Mainnet and Chipnet transactions in [SUBMISSION.md](SUBMISSION.md#evidence) show them on-chain.

## Demo script (2 minutes 30 seconds)

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:20 | Judge page hero and the grocery fund (simulation) | “Sara, Sam and Lee share a flat. Venn gives each of them a $50 daily budget from one fund, and anything bigger needs two of three.” |
| 0:20–0:40 | Pay $20, then $80 → Ask the group → Approve | “Twenty dollars goes through alone. Eighty is over Sara’s budget, so the group votes: two of three say yes and it is paid from the fund. This page simulates it; on Bitcoin Cash the contract does it.” |
| 0:40–1:10 | Deck slide “Create a Venn in four steps” | “In the app you pick a kind, set budgets and votes, and everyone signs for their own seat. Every rule shows its catch before you join.” |
| 1:10–1:40 | Deck slide “BCH Usage” | “A CashScript covenant holds the fund. Each member has a CashToken card with their remaining budget. A payment must rewrite that card, so the VM refuses overspending. On 19 November it ran on Mainnet with MUSD: a budget payment, a group vote, and a full Circle.” |
| 1:40–2:20 | Web wallet: Connect, pair, Send, review | “You can try it now on Mainnet. Connect your own wallet with WizardConnect and send BCH. Your wallet signs; Venn shows the review before anything is broadcast.” |
| 2:20–2:30 | Evidence slide | “Every claim is labelled Mainnet, Chipnet, tested or planned, with transaction IDs. Next: an audit and Venns in the browser.” |

Keep pairing links and QR codes out of recordings. Use a wallet with only a few dollars.

## Verified on 20 November

### Overnight QA on the deployed site (20 November, evening)

- **Mainnet payment through the web wallet:** https://venn.salemkode.com/ paired the owner's Cashonize wallet over WizardConnect (Cashonize: “WizardConnect · Venn · Connected”), showed the same 0.01820379 BCH balance, and sent **0.0001 BCH** to the wallet's own address. Cashonize showed “Send 0.00010000 BCH … Origin: Venn”, Venn showed recipient, amount, fee (374 sat) and total, and broadcast **`a018ad740448ce69d6c1402fee11a53400886c3a5f8a2f6d4254f0d0301c7409`**, accepted by two Mainnet servers.
- **Again from the desktop phone frame** after the frame fix was deployed (Worker `4beca696`): 0.0001 BCH, **`a92b51dcf305bf96c3438b3028a1ec0de90d0b738ac16ee746eb944f6cc99ccd`**.
- **Declining in the wallet:** Cancel in Cashonize returns Venn to the Send form with “User rejected the transaction”; nothing is sent.
- **Found and fixed:** pairing the same wallet again was refused (“This wallet is already Cashonize”), so a pairing whose wallet tab had closed stayed in use and payments waited for an approval that never came. Re-pairing now replaces the old session (tests added).
- **Found and fixed:** on desktop the phone frame had stopped appearing (its inline script no longer parsed after the 20 November Safari fix), so the wallet stretched to the full window. The build now fails if that script does not parse.
- **Android 0.2.0 APK:** downloaded from the release, checksum verified, installed on an Android 16 emulator: opens on Mainnet (“Mainnet · real BCH · Venns hold MUSD”), creates a wallet, connects to Mainnet Electrum, Settings shows 0.2.0.

From fresh browser sessions against the production web export (`npm run build:blaze`, served locally with the same single-page fallback as the Cloudflare Worker; not yet deployed):

- The judge page and the wallet load; a nested route (`/receive`) survives a hard reload.
- **Mainnet:** a fresh Cashonize wallet paired over WizardConnect (in Chrome, and again in Safari on an iOS 26 simulator after Mainnet became the default). Venn showed its balance (0) and the same receive address Cashonize shows. The Send screen opened. No Mainnet payment was made.
- **Chipnet:** a second fresh Cashonize wallet received 0.001 tBCH from the public faucet (relayed to both Chipnet servers and confirmed), paired, and sent 0.0002 tBCH to itself. Cashonize showed the signing request from “Venn”; Venn then showed the full review and broadcast **`7594e82ee1193e59b13cb085e10bd5c2a7381f64d15425c9f065456fc802bf4e`**, confirmed on both Chipnet servers. The pairing survived a page reload.
- An earlier attempt (`b9d4cd30…`) was accepted by both servers and then dropped when the faucet replaced its own unconfirmed parent transaction; the repeat used confirmed coins.
- After Mainnet became the default (20 November), a wallet paired on Chipnet before the change still opened on Chipnet.
- Found and fixed while testing: the activity list counted only the receive address of a connected wallet (a payment read as the whole input coin); a wallet connected on the other network produced a message naming another app and left no way out. Both have tests.

## Offline proof

Run this from the repository root after `npm ci`. The tests build and validate signed transactions with local fixtures and run without funds or a signing wallet. Keep the public fixtures unfunded.

```sh
npm run demo:blaze
```

Expect four passing cases covering seat-specific consent, creation and discovery after everyone accepts, a 20,000-sat payment that leaves 30,000 sat, and rejection of a 50,001-sat payment. The runner skips unrelated tests. For the full creation, official-state, voting and delayed-recovery scenarios, run the additional suites below.

```sh
npm test -- tests/venn/genesis.test.ts tests/venn/official.test.ts
npm test -- tests/venn/vote.test.ts tests/venn/recovery.test.ts
```

## Native Chipnet rehearsal

The 19 November device run is recorded in [live-chipnet-2026-11-19.md](../live-chipnet-2026-11-19.md). Two local wallets on one device can pass invitations, acceptances, proposals and approvals to each other as codes, exactly as two phones would.

Start with a [development build](../../README.md#run-the-app) and two fresh native test wallets with distinct keys. Use separate devices or switch local wallets with the wallet selector. Fund the creator’s wallet using **Wallet → Receive → tBCH → Get free tBCH**. Keep wallet backups, recovery screens, and the share sheet’s contact suggestions out of the recording.

1. On the creator’s wallet, verify **Settings → Network → Chipnet**. In **Venns → Create a Venn**, choose **Shared**, name the Venn and add the second member. Set a small budget for the member. Choose **Next: review**, then **Save and share invitation**.
2. On the second wallet, open **Venns → Join**, paste the invitation code and select **Open invitation**. Read the rules, select the member’s seat, and choose **Accept my seat**. Bring the resulting acceptance back to the creator.
3. Paste it into the creator’s plan and choose **Add acceptance**. Read the displayed creation cost. Use **Add money to your Venn key** if needed and verify the transfer has arrived. The cost includes the first deposit, member fee outputs, contract outputs, and the network fee.
4. Review the deposit and choose **Create the Venn** when ready to send on Chipnet. Open **Venns** and select the new entry. On the second wallet, use **Wallet → Refresh**, then open **Venns** once the creation is visible to the network.
5. On a wallet with an available budget and fee funds, open the Venn, choose **Pay**, and enter a valid `bchtest:` destination you control. Enter an amount above the displayed budget to show that the app blocks **Review payment**. Reduce the amount to within the budget and review the full payment details. For a live Chipnet demo, send once, then check the recipient and the updated budget.
6. Save the creation and spend transaction IDs from the chain if both are verified. On a timeout or uncertain result, stop and check chain state before any further submission.

