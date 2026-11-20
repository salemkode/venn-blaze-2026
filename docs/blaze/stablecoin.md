# Venn Test USD on Chipnet

Venn’s shared funds use a single allowlisted fungible CashToken on Chipnet. Seat invitations commit to its category, and amounts in the plan, on the card and on chain are integer cents.

- **Reference asset:** Riften Labs publishes Moria USD (MUSD) with two decimals and Mainnet category `b38a33f750f84c5c169a6f23cb873e6e79605021585d4f3408789689ed87f366`. Its app reports that the v1 lending contract was disabled. Confirm current issuance and redemption before any production rollout. [Deployment details](https://docs.riftenlabs.com/moria/technical/deployment/) · [Moria app](https://app.moria.money/)
- **Test asset:** Venn Test USD has two decimals and a supply of 100,000 cents on Chipnet. Category `4514d3386913330eb7ebdb76187e8c2029b6f1a9556d5a22328e6b099591507e`. The faucet issued fungible tokens without an NFT or minting capability in that category. This is a test asset with no dollar value or redemption. [Genesis transaction](https://chipnet.imaginary.cash/tx/62ff26f21a943093e40485d7fb3c885946eabb9aac922011a49f8a0dfa8fea43)
- **Network costs:** The organizer supplies Chipnet BCH for contract outputs and fees, and pre-funds each invited member’s Venn key with 25,000 satoshis for new shared funds. A member can check their BCH fee balance and open their fee funding address from the payment form. Actual fees depend on the transaction. Refresh balances after topping up.

## Try it

1. On Chipnet, open **Venns → Create a Venn** and choose a preset. Set budgets in Venn Test USD and share the plan with members.
2. Open **Wallet → Receive** (it opens on Venn Test USD) or **Add money to your Venn key** from the plan. The Venn key page shows the token-aware Venn Test USD address and, separately, the tBCH address for network fees. Creation uses a separate BCH output at index zero for the Venn’s rules and member-card category. If your fee coin is at another index, Venn first offers a reviewed self-transfer to prepare it.
3. Add each acceptance and review the first deposit. Review shows the destination, deposit in Venn Test USD, network fee and total BCH used.
4. A member with a budget can pay a token-aware Chipnet address. The payment review shows the stablecoin amount, BCH attached to the token output, and BCH network fee. A pending record is saved before submission.
5. **Receive** on a funded Venn shows its token-aware deposit address. Older BCH Venns remain visible as historical records.

Run `npm test` for the signed funding and member-payment VM checks, and see the [XO allowance demo](../../contracts/xo-allowance/README.md) for the same allowance idea as an XO template, run live on Chipnet with its own fixed-supply test token.

## Android live check

On November 18, the Venn Android build prepared its fee coin, deposited 15.00 Venn Test USD and paid 5.00 to a controlled token-aware Chipnet address. The app showed **Sent** and a remaining balance of **10.00**. BCH Ninja returned both signed transactions, and the decoded bytes passed BCH 2026 VM verification against their actual source outputs.

- Fee coin preparation `6aded1f4ceeb4ff84bd348b6db7f58d6702c524516b6e368343a3ee34b0c0395`. The reviewed self-transfer used 193 satoshis in network fees.
- First deposit `c3d373d8fc680e164fade656523eac8e6d42606a19f27a22d689d9eda1e2eccf`. The deposit used 905 satoshis in network fees.
- Payment `a70de74265da7ffb456ec78f9487520071525214429baa610ee6ad87cc07c9aa`. The payment used 8,215 satoshis in network fees and attached 1,000 satoshis to the recipient’s token output.

The deposit and payment were in the Chipnet mempool at the verification checkpoint.
