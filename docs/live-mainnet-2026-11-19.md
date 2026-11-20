# Live Mainnet run: Venn v2 and Circle with MUSD (19 November 2026)

Every transaction below was built by the app's own code (`scripts/live/mainnet.live.ts`), checked by
the BCH 2026 VM, recorded, then broadcast to all four Mainnet Electrum servers in `src/core/electrum.ts`.
The same sequence runs offline in `tests/venn/mainnet.test.ts`.

**Funding, from the owner's Cashonize wallet with their approval (a budget of 1.00 MUSD and 0.002 BCH
for fees):** 0.00496644 BCH bought 1.01 MUSD on Cauldron
([`872ae30c…`](https://explorer.bitcoinunlimited.info/tx/872ae30c18759aed18ae1ed3f86496b4d435aa6e10b52b9c25853844d47b3baf));
Cashonize then sent 0.002 BCH and 1.00 MUSD to a dedicated test key A. B is a second dedicated key.
MUSD is category `b38a33f750f84c5c169a6f23cb873e6e79605021585d4f3408789689ed87f366` (Moria USD, two
decimals), checked on chain.

| What | Transaction |
| --- | --- |
| Venn v2 genesis: A (spends alone up to 0.20 a day, required voter) and B; 0.60 MUSD deposit. The app reads it as "Official Venn contract, Venn v2 · 6d22393b" | `40bdcea8d2a8dd44564f204afa433f77733047fbb479a02d4eb02a8f5e184b33` |
| A pays 0.10 MUSD alone, from its budget, to the owner (5,456 bytes) | `c9bfc422bcff62299d17f46d45b1476d19aae0fb42e5266298b1f9a709c8a6f4` |
| Payment vote through proposal and approval codes, A and B approving: the remaining 0.50 MUSD to the owner (15,353 bytes) | `adb33e9aaa54a80c32a8d0ca989cdacc72b085c3dd1ca97231d0a972b720e482` |
| Fee coin at output 0 for A | `6f640962edb5b4e4949b5d550a4c3f567fb959d5bb3ef915e4d2da6153032e7f` |
| Circle genesis: A then B, 0.10 MUSD a seat each round | `c593a2d3e57f1e06b43833cb0274b7ec38dc6a3d5c0d742648780af7771344d6` |
| Round 1: both seats paid, pot of 0.20 to A | `05d46339…`, `a9066b22…`, `9c57cb300286c362a23b820cc79e6bd964118e52f8270874d207716115d99307` |
| Round 2: both seats paid, pot of 0.20 to B; the Circle is finished | `26139f78…`, `b2cd68f0…`, `b3536e30d4befe85122363feade4b8f8261f216d7866e9b50382f5ed04c64a13` |
| B, then A, return every MUSD unit and every spendable satoshi to the owner | `aa6a39c0eb805aeedceecfb51e032e06b81e17c667fdeef1984463c11cc53e76`, `97b35d40df4839e5b62f846712b1a835bb5ccc99ea1f74321311e9cea7949d31` |

**Outcome.** All 1.00 MUSD
came back to the owner (0.10 by budget, 0.50 by vote, 0.40 from the Circle seats), and the run cost about 45,800
satoshis (about $0.09) in network fees and the small coins the Venn's rules and cards and the Circle's
state keep. Those coins stay at the contracts: a Venn and a finished Circle have no path that destroys
them.

**Not exercised on Mainnet:** recovery (request, completion, the two ways to stop one) and membership
votes. They ran on Chipnet ([live-chipnet-2026-11-19.md](live-chipnet-2026-11-19.md)) and every path
has VM tests; the contract bytecode is identical on both networks.
