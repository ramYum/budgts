import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// DB-integration layer: real Postgres (budgts-staging), synthetic fixtures, no
// Plaid, no browser. Kept out of the default `npm test` (unit-only). Run with
// `npm run test:integration`.
loadEnv({ path: ".env.staging" });

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` only no-ops under Next's `react-server` resolve
      // condition; Vitest doesn't set it, so importing it here would
      // otherwise throw unconditionally (its default `index.js`) for every
      // server-only module this suite touches (account-deletion.test.ts
      // imports src/lib/account/delete-account.ts and, transitively via
      // disconnectPlaidItem, src/lib/plaid/client.ts). `empty.js` is the
      // exact no-op file Next's own bundler aliases to for the client
      // graph — reusing it here keeps every source file's guard intact.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false, // one shared staging database
  },
});
