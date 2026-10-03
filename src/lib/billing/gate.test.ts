// @vitest-environment node
/**
 * The bank-sync gate matrix (owner decision 2026-10-02). The access decision itself is `hasPremium` (reducer.test.ts);
 * this proves the gate asks it only while billing is configured and answers 402 with the entitlement view otherwise.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-request-user", () => ({ getRequestUser: async () => null }));

import { loadBillingConfig, type BillingConfig } from "./config";
import type { Db } from "./db";
import { MANUAL_GRANT_ACCESS_UNTIL } from "./entitlement";
import { requireBankSyncAccess } from "./gate";

const NOW = new Date("2026-11-01T12:00:00Z");
const DAY = 86_400_000;
const OFF: BillingConfig = loadBillingConfig({});
const ON: BillingConfig = loadBillingConfig({ REVENUECAT_WEBHOOK_SIGNING_SECRET: "whsec", REVENUECAT_SECRET_API_KEY: "sk_test" });
const SANDBOX_ON: BillingConfig = { ...ON, environment: "sandbox" };

/** A Db holding one entitlements row (or none) for `user-a`. */
function dbWith(row: Record<string, unknown> | null): Db & { calls: number } {
  const db = {
    calls: 0,
    query: async () => {
      db.calls++;
      return row ? [{ user_id: "user-a", provider: null, store: null, product_id: null, provider_customer_id: null, will_renew: false, trial_started_at: null, trial_ends_at: null, last_provider_event_at: null, last_reconciled_at: null, renewal_price_amount: null, renewal_price_currency: null, ...row }] : [];
    },
    transaction: async () => {
      throw new Error("not used");
    },
  };
  return db as unknown as Db & { calls: number };
}

const paid = { state: "active", provider: "revenuecat", store: "apple", product_id: "budgts_monthly", will_renew: true, access_until: new Date(NOW.getTime() + 20 * DAY) };
const trial = { state: "trialing", provider: "revenuecat", store: "google", trial_started_at: new Date(NOW.getTime() - DAY), trial_ends_at: new Date(NOW.getTime() + 6 * DAY), access_until: new Date(NOW.getTime() + 6 * DAY) };
const grant = { state: "active", provider: "manual", access_until: MANUAL_GRANT_ACCESS_UNTIL };
const lapsed = { state: "expired", provider: "revenuecat", store: "apple", access_until: new Date(NOW.getTime() - 3 * DAY) };
const liveButPast = { ...paid, access_until: new Date(NOW.getTime() - DAY) }; // a missed expiry webhook
const refunded = { state: "revoked", provider: "revenuecat", store: "apple", access_until: new Date(NOW.getTime() - DAY) };

describe("requireBankSyncAccess", () => {
  it.each([
    ["no entitlement row", null],
    ["lapsed", lapsed],
    ["paid", paid],
  ])("billing NOT configured: allows everyone (%s) and never reads the database", async (_, row) => {
    const db = dbWith(row);
    expect(await requireBankSyncAccess("user-a", { config: OFF, db, now: NOW })).toBeNull();
    expect(db.calls).toBe(0);
  });

  it("billing configured on a sandbox (staging) deployment gates too", async () => {
    expect((await requireBankSyncAccess("user-a", { config: SANDBOX_ON, db: dbWith(null), now: NOW }))?.status).toBe(402);
  });

  it.each([
    ["a paid subscription", paid],
    ["a free trial", trial],
    ["a permanent manual grant", grant],
  ])("billing configured, %s: allowed", async (_, row) => {
    expect(await requireBankSyncAccess("user-a", { config: ON, db: dbWith(row), now: NOW })).toBeNull();
  });

  it.each([
    ["no entitlement row", null, "none"],
    ["lapsed", lapsed, "expired"],
    ["a live state whose period ended (missed webhook)", liveButPast, "expired"],
    ["refunded", refunded, "revoked"],
  ])("billing configured, %s: 402 premium_required with the entitlement view", async (_, row, status) => {
    const res = await requireBankSyncAccess("user-a", { config: ON, db: dbWith(row), now: NOW });
    expect(res?.status).toBe(402);
    expect(res?.headers.get("cache-control")).toBe("private, no-store");
    const body = (await res!.json()) as { error: string; entitlement: { hasPremium: boolean; status: string } };
    expect(body.error).toBe("premium_required");
    expect(body.entitlement).toMatchObject({ hasPremium: false, status });
  });

  it("a manual grant stays allowed however far in the future it is asked", async () => {
    expect(await requireBankSyncAccess("user-a", { config: ON, db: dbWith(grant), now: new Date("9000-01-01T00:00:00Z") })).toBeNull();
  });
});
