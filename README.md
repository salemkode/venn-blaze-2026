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

For native builds, read [development setup](docs/development.md). The [contract guide](docs/contracts.md) describes the shared funds. The [MIT license](LICENSE) covers the project. Bundled dependencies include their own license files.

This source snapshot comes from Venn release revision `da29126`. The hosted acceptance test paired an unfunded Mainnet wallet and verified its receiving address. The automated payment test checked a signed Mainnet transaction against the BCH VM without broadcasting.
