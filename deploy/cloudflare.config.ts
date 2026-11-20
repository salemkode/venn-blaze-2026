// Cloudflare deployment of the judge site: an assets-only Worker serving `npm run build:blaze`
// (the web wallet at the root, the BLAZE page at /blaze/).
// From this folder, after `npm run build:blaze` at the repository root: cf deploy ../dist
// A plain object: defineConfig from "cf/config" only adds types.
export default {
  worker: {
    name: 'venn-blaze',
    compatibilityDate: '2026-11-01',
    // Expo Router is a single-page app: existing files first, then index.html for wallet routes.
    assets: { notFoundHandling: 'single-page-application' },
    domains: ['venn.salemkode.com'],
  },
};
