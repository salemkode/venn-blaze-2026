# Live Chipnet run: Venn v2, VennMoney and Circle (19 November 2026)

Every transaction below was built by the app's own code, checked by the BCH 2026 VM, broadcast to Chipnet
and accepted into the mempool. Test funds only: 300,000 sats came from the public chipnet.bch.ninja faucet
(one request, `5cf3d249…`); no CAPTCHA was involved.

**Confirmation and recovery completion.** For hours nothing here confirmed: chipnet.bch.ninja, the
server everything was sent through (the faucet's own payment included), kept a ten-transaction-deep
unconfirmed faucet chain to itself, and the other Chipnet server (chipnet.imaginary.cash) had never seen
any of it. Re-broadcasting that chain and ours to the second server got the recovery chain mined within
minutes (block 337,675). After the 512-second wait the new key took over the seat:

| What | Transaction |
| --- | --- |
| Recovery complete: key D now holds C's seat (5,223 bytes); the Venn stays official with cards A, B, D | `d2b69db5554422a105572969df3284a06b051e704ccb8b1c4ea759b5133fa851` |

The app now sends every broadcast to all Chipnet servers it knows (identical bytes, so no new spend), so a
single non-relaying server cannot strand a transaction again. By tip 337,688 every transaction in this document
(36 of 36, scripted and on-device) was confirmed; `scripts/live/confirmations.live.ts` re-checks them.

## On a device (Android emulator, Expo 58 dev build, Venn Test USD)

Two local wallets on one emulator passed invitations, acceptances, proposals and approvals to each other as
codes, exactly as two phones would.

| What | Transaction |
| --- | --- |
| Personal Venn v2 created (5.00 deposit), shown as "Official Venn contract, Venn v2 · 6d22393b" | `c37b95308415a85cd0816f87b516ad0f9f9a69461cd10074228680eaa69a93a4` |
| Decisions → payment vote of 1.00, sent by its one required voter | `e68d845006cc4488899871849dc4d5b5a09cd0d228328b54a0efce5f694581ce` |
| Circle created (2 members, 1.00 a round), "Official Circle contract · Circle v1 · 6d083bf6" | `9bd63b02a2c96a5dd67b03227df7d27087ff998142286747e5a959b406c6288a` |
| Circle: my contribution | `63e73e61b34093f6690d0dee377dba6892874f18369162dcb141b5e4a19342bf` |
| Circle: "Pay it for them" (the other seat) | `632340063d9faa46856abc4abe0dcffde6804fb1aefd3cf70ccd7d0227fa2834` |
| Circle: round 1 paid out, 2.00 to its member | `10fa0a5e2ea7e521b701a9dc53b2821adce68bdabf9c7830960f79c02650b291` |
| Shared Venn v2 created by both wallets (stop rule A) | `f464fc58723e4c1863a7640db6f03a4e096f6d9915d53ddd5c1fc3de0c1502e3` |
| Lost phones → the other wallet (a helper) asked to replace this seat's key | `0d117273316003d3cc2951993fee9e088e162d7911e9bee690d44e7fb131fcca` |
| "Stop it with my key" | `4a040ff59bf3d983899421441c69f2f043791b99f6d0b97873195959869cb40c` |
| Two-signer payment vote: proposed by one wallet, approved on the other's Approve screen, sent | `327937016f413d699646c5666f07e9cbcde1a63f7d9b641d25c83345a1aa4acb` |

Found on the device and fixed the same day: a two-person preset needed two helpers although the seat
being recovered cannot help itself (fe63a02), and a wallet that found a Venn on-chain showed "Member 1"
for every seat. It now names the seats it can vouch for (the creator, whose key is in the invitation, and
its own); card order is the creator's choice, so other seats keep a neutral label.

## Scripted (`scripts/live/chipnet.live.ts`, dedicated keys, a fixed-supply test token)

| What | Transaction |
| --- | --- |
| Venn v2 genesis: 3 members, recovery on | `5202fca1d3d639562054fe36a7d7800e152e9e39cf6c3033e748ccd931398484` |
| Budget spend (5,462 bytes) | `900f2043c265cf2e104423ef5bbabb2d28a9947f3a958ff97188ac26ebed30e0` |
| Payment vote through proposal/approval codes (20,322 bytes) | `3bb8beb03baeb72219fd4b8d6e5a31c8640e99998a241d7c819b799e9658af97` |
| Recovery request approved by two helpers | `a7a2368615e7c5111d630b798ae9964485a5cec264a14de29134ef6933972b18` |
| Circle genesis (3 members) | `b3f3db66c3746b346fb1c4568f83ab3f87e079ea1f6940cdcf471ee562a80da5` |
| Nine contributions and three payouts, in turn order | `1600f28d…`, `067a2741…`, `9177d5c0…`, `a8afdc9e…`, `f401e211…`, `74bb1e2b…`, `36efcbdf…`, `1617a2e4…`, `25623ef2…`, `3b58e7b0…`, `30eebaf1…`, `2c6b6a8e…` |
| Money sent after the last round, then swept to the last member | `d8e6e729…`, `85fedab79d3350e321e045f924b743d470999a5c1daf0f038fd7d4c4fa539196` |

The full list with notes is in the gitignored `artifacts/live-v2/state.json`, together with the test keys.
