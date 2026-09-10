import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// DB-integration layer: real Postgres (budgts-staging), synthetic fixtures, no
// Plaid, no browser. Kept out of the default `npm test` (unit-only). Run with
// `npm run test:integration`.
loadEnv({ path: ".env.staging" });

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
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
