import { describe, expect, it } from "vitest";
import { productionEnvProblems } from "./production-env";

const PLAID_ON = {
  DATABASE_URL: "postgres://user:pass@db.example:6543/postgres",
  NEXT_PUBLIC_PLAID_ENABLED: "1",
  PLAID_ENV: "production",
  PLAID_CLIENT_ID: "client",
  PLAID_SECRET: "secret",
  PLAID_TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString("base64"),
  CRON_SECRET: "cron",
};

describe("productionEnvProblems", () => {
  it("passes a production env that has everything", () => {
    expect(productionEnvProblems(PLAID_ON)).toEqual([]);
  });

  it("flags a missing DATABASE_URL", () => {
    expect(productionEnvProblems({ ...PLAID_ON, DATABASE_URL: undefined })).toEqual([
      expect.stringContaining("DATABASE_URL"),
    ]);
  });

  it("names a missing Plaid secret when bank sync is on", () => {
    expect(productionEnvProblems({ ...PLAID_ON, PLAID_SECRET: "" })).toEqual([expect.stringContaining("PLAID_SECRET")]);
  });

  it("flags a missing CRON_SECRET, which would otherwise make every sweep a quiet 401", () => {
    expect(productionEnvProblems({ ...PLAID_ON, CRON_SECRET: undefined })).toEqual([
      expect.stringContaining("CRON_SECRET"),
    ]);
  });

  it("does not ask for Plaid's secrets while bank sync is off", () => {
    expect(productionEnvProblems({ DATABASE_URL: PLAID_ON.DATABASE_URL })).toEqual([]);
  });

  it("reports every problem at once", () => {
    // No DB, no Plaid config (the first missing name), no cron secret.
    expect(productionEnvProblems({ NEXT_PUBLIC_PLAID_ENABLED: "1" })).toHaveLength(3);
  });

  describe("billing vs the 'deleted right away' retention promise", () => {
    const BILLING_LIVE = {
      BILLING_ENVIRONMENT: "production",
      REVENUECAT_WEBHOOK_SIGNING_SECRET: "whsec",
      REVENUECAT_SECRET_API_KEY: "sk",
    };

    it("refuses a production build with billing live and retention 0", () => {
      expect(productionEnvProblems({ ...PLAID_ON, ...BILLING_LIVE, LEGAL_RECORD_RETENTION_YEARS: "0" })).toEqual([
        expect.stringContaining("Decide how long payment records are kept"),
      ]);
    });

    it("allows retention 0 while billing is off (nobody can pay, so nothing is kept)", () => {
      expect(productionEnvProblems({ ...PLAID_ON, LEGAL_RECORD_RETENTION_YEARS: "0" })).toEqual([]);
      expect(
        productionEnvProblems({ ...PLAID_ON, ...BILLING_LIVE, BILLING_ENVIRONMENT: "sandbox", LEGAL_RECORD_RETENTION_YEARS: "0" }),
      ).toEqual([]);
    });

    it("allows billing live once a retention period is set", () => {
      expect(productionEnvProblems({ ...PLAID_ON, ...BILLING_LIVE, LEGAL_RECORD_RETENTION_YEARS: "7" })).toEqual([]);
    });
  });
});
