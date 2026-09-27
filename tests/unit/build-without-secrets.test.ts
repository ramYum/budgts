import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `next build` imports every route module to collect page data, and CI and
// Vercel Preview builds carry no server secrets. These tests are that step in
// miniature: with every secret gone, the server modules must still import.
// Only a Vercel *production* build may demand secrets (npm's prebuild,
// tools/check-production-env.ts).
vi.mock("server-only", () => ({}));

const SECRETS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "PLAID_CLIENT_ID",
  "PLAID_SECRET",
  "PLAID_ENV",
  "PLAID_TOKEN_ENC_KEY",
  "PLAID_OAUTH_REDIRECT_URI",
  "CRON_SECRET",
  "SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_PLAID_ENABLED",
  "VERCEL",
  "VERCEL_ENV",
];

describe("building without secrets", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    vi.resetModules();
    for (const name of SECRETS) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });
  afterEach(() => {
    for (const name of SECRETS) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it.each([
    "@/app/api/plaid/exchange/route",
    "@/app/api/plaid/item/route",
    "@/app/api/plaid/link-token/route",
    "@/app/api/plaid/recurring-scan/route",
    "@/app/api/plaid/sync-due/route",
    "@/app/api/plaid/test/seed/route",
    "@/app/api/plaid/webhook/route",
    "@/app/api/export/transactions/route",
    "@/server/plaid/service",
    "@/server/plaid/actions",
  ])("imports %s", async (path) => {
    await expect(import(path)).resolves.toBeDefined();
  });

  // The prebuild itself, run as npm runs it, against the real process env.
  const prebuild = (env: Record<string, string>) =>
    spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "tools/check-production-env.ts"], {
      env: { ...process.env, ...env },
      encoding: "utf8",
    });

  it("lets CI, local and Preview builds through without secrets", () => {
    expect(prebuild({}).status).toBe(0);
    const preview = prebuild({ VERCEL: "1", VERCEL_ENV: "preview" });
    expect(preview.status).toBe(0);
    expect(preview.stdout).toContain("Production env check skipped: preview build");
  });

  it("refuses a Vercel production build that is missing them", () => {
    const result = prebuild({ VERCEL: "1", VERCEL_ENV: "production", NEXT_PUBLIC_PLAID_ENABLED: "1" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Refusing to build for production[\s\S]*DATABASE_URL[\s\S]*CRON_SECRET/);
  });
});
