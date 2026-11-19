# Venn contracts

Three CashScript 0.14 contracts for the BCH 2026 VM (Chipnet). `npm run compile:contract` rebuilds
them, writes `contracts/*.json`, `src/venn/artifact.ts` and the fingerprints in
`contracts/registry.json`, and fails if a contract embeds a VennMoney template that is not the compiled
one.

| Contract | Holds | Fingerprint source |
| --- | --- | --- |
| `VennVault.cash` (Venn v2) | the rules NFT (minting) and one card per member (mutable) | `VAULT.sha256` |
| `VennMoney.cash` | a Venn's or Circle's money; moves only when input 0 is spent by that exact contract | `MONEY.sha256` |
| `CircleVault.cash` (Circle v1) | one Circle state NFT (mutable) | `CIRCLE.sha256` |

Venn v1 (`c351006a…`) has been removed. The app runs Venn v2 only: it neither builds v1 transactions nor
keeps Venns made with v1.

## VennVault v2

Input 0 is always the lead: a member card (`spend`, `recoveryComplete`, `recoveryCancelByKey`) or the
rules NFT (`vote`, `recoveryRequest`, `recoveryCancelByVote`). Every other Venn input runs `follow()`,
every money input runs VennMoney's `follow()`; both defer to the lead, and every lead function accounts
for every input and output at both the Venn address and the money address.

Invariants the contract enforces (each has a VM test in `tests/venn/hardening.test.ts` or the suites
beside it):

- **Budgets need the spending rule.** A new member who spends alone, giving or taking the spend role, a
  changed budget, or moving a budget card to another key all count as spending changes, besides any
  membership change.
- **Every card a vote writes is valid.** Roles 1–15, required members also vote, a budget if and only if
  the member spends alone, a positive budget and period, canonical non-negative 8-byte amounts, and clear
  recovery fields. A vote can therefore never create a card that blocks every later vote.
- **Rules stay workable.** Counters equal the cards; 1–16 voters; required ≤ voters; recovery is on or
  off, and when on has a wait of at least one unit, 1 ≤ helpers needed ≤ helpers, and a strong path (stop
  rule C only) at least as demanding as the normal one.
- **Votes are exact.** Exactly `max(need, required)` approvals, every required member among them, each
  an `ALL|UTXOS|FORKID` (0x61) signature from a voter card with no recovery waiting; plan bytes are 0x00
  or 0x01. Nobody can drop an approval or rewrite the plan to change the txid.
- **A waiting recovery cannot be restarted.** Cards with a recovery waiting cannot be carried along
  unchanged in votes, recovery requests or votes to stop one (they can still be removed, and voters can
  still stop the request); the card cannot spend.
- **Money is money.** A burned card's BCH counts as Venn money, so it leaves only under the payments rule.
- **Refills lose nothing.** A refilling budget consumes only the time its refill used.
- **Sizes fit.** 16 voters all signing a vote with a payment is under 100,000 bytes and standard.

The app calls a Venn official only if its creation wrote every rules and card commitment canonically (a
value the app would read loosely, such as a recovery flag of 2, could otherwise freeze it). One key holding
two seats after a vote is shown as a warning: the contract counts seats.

Inherent limits (shown to members as weaknesses): whoever controls enough votes controls the Venn; the
contract cannot tell people apart, so a vote that may add members can add someone's second key; enough
helpers together can take over a seat after the wait; fixed-period budgets carry unused periods over.

## Circle v1

A savings circle (jam'eya). Constructor: Circle category, token category, contribution, round length,
start time and the members' key hashes in payout order (2–16). State NFT (8 bytes): version, round, paid
bitmap, missed bitmap.

- `contribute(seat)`: anyone pays exactly one contribution for an unpaid seat in the current round; it
  waits at the Circle's VennMoney address.
- `sweep()`: after the last round, every Circle money coin the transaction spends (left behind by a
  payout, or sent later) goes to the last member in the order; the finished state continues unchanged.
- `payout()`: when every seat has paid, or once the round's deadline (`start + (round + 1) * period`) has
  passed by the transaction's own locktime, every money coin goes to that round's member, at least one
  contribution for each seat marked paid; seats that did not pay join the missed record; the next round
  starts.

`contribute` also refuses any Circle whose last deadline does not fit a transaction locktime, so a
schedule that could never time out never holds money. Nobody signs for the Circle, so no key can redirect
its money, and no money can be stuck.
Weaknesses: the contract cannot make anyone pay, and someone who stops paying after their own turn keeps
what they received; after a deadline anyone can pay the round out, so late contributions miss it; money
sent after the last round goes to the last member.

## Evidence and what remains

`npm test` runs every contract path on libauth's BCH 2026 VM (standard and consensus rules), including
crafted transactions for each review finding. Live Chipnet broadcasts of v2 and Circle have not been made:
the test treasury funds only registered recipients, and Venn is not registered. The contracts have had an
internal review by two independent reviewers, not an external audit.
