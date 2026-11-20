import { defineConfig } from 'vitest/config';

// Live Chipnet runs: never part of `npm test`. Run one step with
//   STEP=<name> npx vitest run --config scripts/live/vitest.live.config.ts
export default defineConfig({
  test: { include: ['scripts/live/**/*.live.ts'], setupFiles: ['tests/setup.ts'], testTimeout: 180_000 },
});
