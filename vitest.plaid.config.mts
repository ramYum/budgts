import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// Plaid-integration layer: real Plaid Sandbox + real staging Postgres. Slow,
// network-bound, needs PLAID_CLIENT_ID / PLAID_SECRET in .env.staging. Kept out
// of `npm test` and `npm run test:integration`. Run with `npm run test:plaid`.
loadEnv({ path: ".env.staging" });

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/plaid-integration/**/*.test.ts"],
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
