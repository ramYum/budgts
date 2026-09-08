import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// Make .env.local (Supabase URL + secret key) available to test helpers.
loadEnv({ path: ".env.local" });

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1, // shared Supabase project; auth rate limits cause the odd transient
  workers: 1, // tests share one Supabase project; serial avoids auth rate limits
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Test against a production build — a cold `next dev` compile can exceed
    // the per-test timeout on the first navigation.
    command: "npm run build && npm run start",
    url: baseURL,
    reuseExistingServer: false, // always a fresh build+start; a stale server serves a wrong build
    timeout: 240_000,
  },
});
