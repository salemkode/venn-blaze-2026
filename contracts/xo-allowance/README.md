# Venn Merchant Allowance (XO template v3)

An XO CashTemplate that lets anyone trigger a capped payment of a fixed-supply fungible token to a preselected merchant, at most once per interval of blocks. Each payment leaves the remainder in a new envelope with the same program, so the next payment spends the successor. Once the configured block height is reached, the remaining tokens and unused fee reserve can go to the sponsor; before that the sponsor has to wait, and even after it a payment can still compete with the refund for the same output. The envelope holds the BCH for its own network costs, so the operator's account only signs XO invitation commits. The model is for a fixed-supply category with no NFT authority.

This standalone example applies Venn's allowance idea. The wallet's shared Venn contract also has member cards, voting and recovery. Everything here runs on Chipnet with test funds worth no money.

[Template](venn-merchant-allowance.xo.json) · [Official XO examples](https://gitlab.com/GeneralProtocols/xo/templates) · [XO debugger](https://blaze.xo.cash/)

## The rules

- **A capped payment to the merchant.** The pay path sends at most `paymentCap` units to `merchantLock`, keeps every other token and the BCH reserve (less a fixed 1,000-satoshi fee and the 1,000-satoshi token carrier) in an identical successor at output 0, and allows exactly one input and two outputs.
- **One payment per interval.** The pay path requires the envelope to be at least `paymentInterval` blocks old (`OP_CHECKSEQUENCEVERIFY`, block-based). Each payment creates a new envelope, so the merchant receives at most the cap per interval.
- **An exact path selector.** The unlocking selector must be 0 (refund) or 1 (pay), so nobody can swap in another value and change a transaction's ID.
- **A timelocked refund.** From `refundHeight` (`OP_CHECKLOCKTIMEVERIFY`) everything can go to `refundLock` in one output.

`allowance.test.mjs` runs every rule on the BCH 2025 and 2026 VMs, including payments before the interval, final or time-based sequences, a rewritten selector, one cent over the cap, a substituted merchant, extra inputs or outputs and token burns. `evidence.test.mjs` checks the committed Chipnet evidence below offline: each executed invitation validates against this template, each transaction hashes to its reviewed ID and passes both VMs spending its recorded parent output.

## Chipnet evidence (19 November 2026)

Main envelope: merchant `bchtest:qzsk9k5x…`, sponsor `bchtest:qqrn7f2k…`, a cap of 30.00, an interval of 2 blocks and a refund height of 337,798 ([terms](evidence/terms.json)). Test token category `4edbcfe9ff206905ed6aea18213a47f0f49172f72345b188acf199f41da7dc30`, 1,000.00 units with two decimals, no NFT.

| Step | Token payment | Left in the envelope | Evidence |
| --- | ---: | ---: | --- |
| Fixed-supply genesis into the envelope | — | 1,000.00 + 10,000 satoshis | [Transaction](https://chipnet.imaginary.cash/tx/2f609c88b79efff22c1d6bbeefa6eea6ef2c86ed1028b893c9073a0d4f45ddc5) |
| Payment, broadcast before the envelope was 2 blocks old | refused: `non-BIP68-final` | unchanged | [Refusals](evidence/refusals.json) |
| Payment | 25.00 | 975.00 + 8,000 satoshis | [Invitation](evidence/payment-invitation.json) · [Review](evidence/payment-review.json) · [Transaction](https://chipnet.imaginary.cash/tx/8b5f1cc7998d33f52c388281f587813459b24222bab3fef2c798efc883c96c5f) |
| Follow-up, broadcast before the successor was 2 blocks old | refused: `non-BIP68-final` | unchanged | [Refusals](evidence/refusals.json) |
| Follow-up payment, from the successor | 15.00 | 960.00 + 6,000 satoshis | [Invitation](evidence/follow-up-invitation.json) · [Review](evidence/follow-up-review.json) · [Transaction](https://chipnet.imaginary.cash/tx/a05e6cea2dc60a35b694d271bff2a06737afe23751bde096dce18255e0f60e9f) |

Refund envelope: the same terms with a refund height of 330,000 ([terms](evidence/refund-terms.json)), 100.00 units of category `c89c5fa91c2588cfcc5faef4a62fcb286b4b83ee30a54e7596b2ffaeaf0ee2f7` and 3,000 satoshis ([genesis](https://chipnet.imaginary.cash/tx/f9fc8bab1479ac006f7d9c05645f81d30176098e4c89c44781576501f1b6517a)).

| Step | Sponsor receives | Evidence |
| --- | ---: | --- |
| Refund | 100.00 + 2,000 satoshis | [Invitation](evidence/refund-invitation.json) · [Review](evidence/refund-review.json) · [Transaction](https://chipnet.imaginary.cash/tx/39b4167c973a43030bdecd2b8c4d455c190759bf7c32ab17eaf5e02fee33c6d7) |

**Chipnet's timelocks run on time, not block count.** That day Chipnet produced about one block a minute, but its nodes applied height-based locks as if each block were ten minutes of median time past. A plain self-payment showed the same, so it is the network, not the template. In practice each interval block took about ten minutes; the payments were accepted 21 and 23 minutes after their parents confirmed. The main envelope's refund (height 337,798) was refused as `bad-txns-nonfinal` while the servers reported tip 337,840, and stays refused until the nodes reach that height. That is why the refund was shown on a second envelope whose height the nodes had already passed. Details are in [refusals.json](evidence/refusals.json). The runner treats both refusals as definite: it removes its pending record and says to approve the same transaction ID again later.

Each payment costs the envelope 1,000 satoshis in fees and attaches another 1,000 satoshis to the merchant's token output. The runner sent each transaction through XO Engine, then relayed the identical bytes to both public Chipnet Electrum servers.

## Inspect the executed invitations

1. Open the [XO debugger](https://blaze.xo.cash/) with a disposable Chipnet account.
2. On **Home**, choose **Import Template**. Paste [the template JSON](venn-merchant-allowance.xo.json) and select **Import JSON**. The template ID is `bc704aef04f952d1de1b27c52fb2e0e086c30c91c174b43b02062814b3f2a74b`.
3. Choose **Join Invitation**, paste [the executed payment invitation](evidence/payment-invitation.json) and select **View invitation**. Inspect the signed commits and its **Broadcast** result. Repeat with [the follow-up](evidence/follow-up-invitation.json) and [the refund](evidence/refund-invitation.json). The preview shows the original invitation without requiring acceptance or a new broadcast.
4. Compare the follow-up's input to output 0 of the payment: its review names the parent invitation.

The earlier v2 template (no interval, no selector check) and its 18 November evidence are in git history at commit `3ee8d3e`; nothing uses them.

## Reproduce with a new envelope

From this directory, use Node 22.13 or newer. XO Engine is pinned to `0.1.1-next.18170561234`, the latest `next` release on 20 November; all 37 tests pass with it. The 19 November Chipnet invitations were executed with `0.1.1-next.18029697917`. The Node demo uses IndexedDB in memory. Build the SQLite binding loaded by the Electrum package and skip the unused native storage builds.

```sh
npm ci --ignore-scripts
npm rebuild sqlite3
npm test
```

1. Copy [terms.json](evidence/terms.json). Replace the merchant and sponsor with controlled Chipnet P2PKH addresses, select a future block height for refunds, and set `"interval"`: the number of blocks between payments (1–65,535; `144` is about a day on mainnet). The payment cap is in token units. Drop `category` and `genesisTxid` until step 2.
2. Run `node allowance.mjs address terms.json` to derive the token-aware envelope address. For a fresh standalone demo, mint a fungible category without an NFT to that address using the [Chipnet faucet](https://chipnet.bch.ninja/). Attach 10,000 test satoshis for the envelope's network costs. Record the faucet’s genesis txid and category in `terms.json`. `node allowance.mjs inspect GENESIS_TXID` prints the actual output indexes, scripts and token amounts.
3. Once the envelope is at least `interval` blocks old (on Chipnet, allow about ten minutes per block; an early attempt is refused as `non-BIP68-final` and can be approved again later), run `node allowance.mjs pay terms.json GENESIS_TXID VOUT 2500 out/review`. This builds and verifies a 25.00 test-dollar payment without submitting it. Review the full merchant address, stablecoin amount, category, BCH costs and transaction ID. To approve it, rerun with the exact reviewed txid as the last positional argument and a new evidence directory such as `out/payment`. The runner writes the signed invitation and a pending record before submission. If the answer is unclear, inspect the txid on Chipnet before proceeding.
4. To create the follow-up, wait another `interval` blocks, then pass the payment txid, output `0` and the new amount. Append `--from out/payment/invitation.json`. This uses the Pay intent declared on the successor. The runner checks the original parent result and reads the actual successor from Chipnet. Review and approve this payment the same way.
5. The template also offers `refund`, on the genesis output or on any successor. Use `refund TERMS TXID VOUT - OUTPUT_DIR` (append `--from PARENT_INVITATION` for a successor) for a review, and approve only after the committed block height has passed; an early attempt is refused as `bad-txns-nonfinal`.

Submission materials are the template, executed invitation files, live results and the instructions above. The [bounty rules](https://bchblaze.com/bounties/build-with-xo/) ask the entrant to write their own development feedback.
