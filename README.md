# Venn

Venn is a Bitcoin Cash wallet and a shared-fund app. Households can agree on spending allowances and voting rules, then sign for their own seats. On Chipnet, a CashScript contract enforces the shared fund's rules and CashTokens track individual allowances.

[Try the judge demo](https://venn.salemkode.com/blaze/) to compare an allowed payment with one satoshi over budget. The hosted wallet pairs with a compatible WizardConnect wallet. Its Mainnet mode handles ordinary BCH payments. Shared funds use Chipnet test coins.

## Build and verify

Use Node.js 22.13 or newer.

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run build:blaze
```

Serve `dist/` at the root of an HTTPS origin and open `/blaze/`. The build includes the judge landing page, video and pitch deck. Serve static files first and route wallet navigation to `/index.html`.

For Android, use the [signed BLAZE preview and checksum](https://github.com/salemkode/venn-blaze-2026/releases/tag/blaze-2026-android-preview). The preview has its own application ID and uses a standalone release bundle. For local native builds, read [development setup](docs/development.md). The [contract guide](docs/contracts.md) describes the shared funds. The [MIT license](LICENSE) covers the project. Bundled dependencies include their own license files.

This source snapshot comes from Venn release revision `da29126`. The hosted acceptance test paired an unfunded Mainnet wallet and verified its receiving address. The automated payment test checked a signed Mainnet transaction against the BCH VM without broadcasting.

## Chipnet receipts

The earlier Android rehearsal used two disposable wallets to create a Shared Venn and approve a payment. Two Chipnet servers confirmed all 17 published receipts from the Android and scripted rehearsals.

- [Shared Venn creation](https://chipnet.imaginary.cash/tx/f464fc58723e4c1863a7640db6f03a4e096f6d9915d53ddd5c1fc3de0c1502e3)
- [Two-signer payment](https://chipnet.imaginary.cash/tx/327937016f413d699646c5666f07e9cbcde1a63f7d9b641d25c83345a1aa4acb)
- [Circle payout](https://chipnet.imaginary.cash/tx/10fa0a5e2ea7e521b701a9dc53b2821adce68bdabf9c7830960f79c02650b291)
- [Seat recovery](https://chipnet.imaginary.cash/tx/d2b69db5554422a105572969df3284a06b051e704ccb8b1c4ea759b5133fa851)
