// @vitest-environment node
/**
 * The billing persistence + processor, proven against REAL Postgres with the repo's real migration chain applied
 * (embedded PGlite, empty database — not the shared staging database). Covers dedupe, ordering, the environment
 * fence, atomicity, the ledger boundary (a trial is never ledgered; a real charge is, exactly once), and the
 * deletion lock.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asBillingDb, createAuthUser, newMigratedDb } from "../../../tests/unit/helpers/pglite-db";
import { hasPremium } from "./entitlement";
import { recordPaidCharge } from "./ledger";
import { processRevenueCatEvent, type ProcessDeps } from "./processor";
import { conversionEvent, DAY, mapped, T0, trialEvent } from "./revenuecat/fixtures";
import { loadEntitlement } from "./store";
import type { Db } from "./db";

let pg: PGlite;
let db: Db;
const NOW = new Date(T0 + 20 * DAY);
const deps = (over: Partial<ProcessDeps> = {}): ProcessDeps => ({ db, environment: "production", now: () => NOW, ...over });

beforeAll(async () => {
  pg = await newMigratedDb();
  db = asBillingDb(pg);
}, 120_000);
afterAll(async () => {
  await pg.close();
});

const count = async (table: string, userId: string) =>
  (await pg.query<{ n: number }>(`select count(*)::int n from ${table} where user_id = $1`, [userId])).rows[0].n;
const ledger = async (userId: string) => ({ subscriptions: await count("subscriptions", userId), payments: await count("payments", userId) });
const eventRows = async (userId: string) =>
  (await pg.query<{ status: string; event_type: string; error: string | null }>(`select status, event_type, error from billing_events where user_id = $1 order by occurred_at, received_at`, [userId])).rows;

describe("trial start: access with NO monetization history", () => {
  it("creates a trialing entitlement, logs the event, and writes NOTHING to the ledger", async () => {
    const u = await createAuthUser(pg);
    const out = await processRevenueCatEvent(deps({ now: () => new Date(T0 + DAY) }), trialEvent(u));
    expect(out).toMatchObject({ status: "processed", applied: true, charged: false });
    const e = await loadEntitlement(db, u);
    expect(e).toMatchObject({ state: "trialing", willRenew: true, store: "apple", productId: "budgts_monthly" });
    expect(e?.trialEndsAt?.getTime()).toBe(T0 + 14 * DAY);
    expect(hasPremium(e, new Date(T0 + DAY))).toBe(true);
    expect(await ledger(u)).toEqual({ subscriptions: 0, payments: 0 }); // the Path A boundary
    expect(await eventRows(u)).toEqual([{ status: "processed", event_type: "INITIAL_PURCHASE", error: null }]);
  });

  it("trial cancellation keeps access and still writes no ledger; expiration ends it", async () => {
    const u = await createAuthUser(pg);
    await processRevenueCatEvent(deps({ now: () => new Date(T0 + DAY) }), trialEvent(u));
    await processRevenueCatEvent(deps({ now: () => new Date(T0 + 3 * DAY) }), mapped(u, { type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", event_timestamp_ms: T0 + 3 * DAY }));
    expect(await loadEntitlement(db, u)).toMatchObject({ state: "trialing", willRenew: false });
    await processRevenueCatEvent(deps({ now: () => new Date(T0 + 15 * DAY) }), mapped(u, { type: "EXPIRATION", event_timestamp_ms: T0 + 14 * DAY }));
    expect(await loadEntitlement(db, u)).toMatchObject({ state: "expired", willRenew: false });
    expect(await ledger(u)).toEqual({ subscriptions: 0, payments: 0 }); // a trial-only user never has ledger history
  });
});

describe("trial -> paid conversion creates the ledger, exactly once", () => {
  it("records the subscription and the trial_conversion payment in integer minor units, and activates access", async () => {
    const u = await createAuthUser(pg);
    await processRevenueCatEvent(deps(), trialEvent(u, T0, { original_transaction_id: `otx-${u}` }));
    const out = await processRevenueCatEvent(deps(), conversionEvent(u, T0 + 14 * DAY, { original_transaction_id: `otx-${u}`, transaction_id: `tx-conv-${u}` }));
    expect(out).toMatchObject({ status: "processed", charged: true, duplicateCharge: false });
    expect(await loadEntitlement(db, u)).toMatchObject({ state: "active", accessUntil: new Date(T0 + 44 * DAY) });
    expect(await ledger(u)).toEqual({ subscriptions: 1, payments: 1 });
    const [p] = (await pg.query<{ type: string; customer_paid_amount: number; currency: string }>(`select type, customer_paid_amount, currency from payments where user_id = $1`, [u])).rows;
    expect(p).toEqual({ type: "trial_conversion", customer_paid_amount: 999, currency: "USD" });
    const [s] = (await pg.query<{ status: string; first_paid_at: Date }>(`select status, first_paid_at from subscriptions where user_id = $1`, [u])).rows;
    expect(s.status).toBe("active");
    expect(s.first_paid_at.getTime()).toBe(T0 + 14 * DAY);
    // the stored payment payload carries no provider PII
    const [{ raw }] = (await pg.query<{ raw: Record<string, unknown> }>(`select raw from payments where user_id = $1`, [u])).rows;
    expect(JSON.stringify(raw)).not.toContain("synthetic@example.com");
    expect(raw).not.toHaveProperty("subscriber_attributes");
  });

  it("a renewal adds a payment and extends access; first_paid_at never moves", async () => {
    const u = await createAuthUser(pg);
    const otx = `otx-${u}`;
    await processRevenueCatEvent(deps(), conversionEvent(u, T0, { original_transaction_id: otx }));
    await processRevenueCatEvent(deps(), mapped(u, { type: "RENEWAL", original_transaction_id: otx, event_timestamp_ms: T0 + 30 * DAY, purchased_at_ms: T0 + 30 * DAY, expiration_at_ms: T0 + 60 * DAY }));
    expect((await ledger(u)).payments).toBe(2);
    expect(await loadEntitlement(db, u)).toMatchObject({ state: "active", accessUntil: new Date(T0 + 60 * DAY) });
    const [{ first_paid_at }] = (await pg.query<{ first_paid_at: Date }>(`select first_paid_at from subscriptions where user_id = $1`, [u])).rows;
    expect(first_paid_at.getTime()).toBe(T0);
  });
});

describe("duplicate webhooks never duplicate money or state", () => {
  it("redelivering the same event id is a no-op once handled", async () => {
    const u = await createAuthUser(pg);
    const ev = conversionEvent(u, T0, { original_transaction_id: `otx-${u}` });
    expect(await processRevenueCatEvent(deps(), ev)).toMatchObject({ status: "processed", charged: true });
    expect(await processRevenueCatEvent(deps(), ev)).toEqual({ status: "duplicate" });
    expect(await processRevenueCatEvent(deps(), ev)).toEqual({ status: "duplicate" });
    expect(await ledger(u)).toEqual({ subscriptions: 1, payments: 1 });
    expect(await eventRows(u)).toHaveLength(1);
  });

  it("the same store transaction arriving under a DIFFERENT event id still yields one payment", async () => {
    const u = await createAuthUser(pg);
    const otx = `otx-${u}`;
    const tx = `tx-shared-${u}`;
    await processRevenueCatEvent(deps(), conversionEvent(u, T0, { original_transaction_id: otx, transaction_id: tx }));
    const again = await processRevenueCatEvent(deps(), conversionEvent(u, T0, { original_transaction_id: otx, transaction_id: tx }));
    expect(again).toMatchObject({ status: "processed", charged: false, duplicateCharge: true });
    expect((await ledger(u)).payments).toBe(1);
    expect(await eventRows(u)).toHaveLength(2); // both deliveries are audited
  });
});

describe("out-of-order delivery", () => {
  it("an older event cannot move access backward, but the money in it is still recorded", async () => {
    const u = await createAuthUser(pg);
    const otx = `otx-${u}`;
    // the later renewal arrives FIRST
    await processRevenueCatEvent(deps(), mapped(u, { type: "RENEWAL", original_transaction_id: otx, event_timestamp_ms: T0 + 30 * DAY, purchased_at_ms: T0 + 30 * DAY, expiration_at_ms: T0 + 60 * DAY }));
    // then an EARLIER renewal (a delayed delivery), and an earlier cancellation
    const late = await processRevenueCatEvent(deps(), mapped(u, { type: "RENEWAL", original_transaction_id: otx, event_timestamp_ms: T0, purchased_at_ms: T0, expiration_at_ms: T0 + 30 * DAY }));
    expect(late).toMatchObject({ status: "processed", applied: false, charged: true });
    await processRevenueCatEvent(deps(), mapped(u, { type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", event_timestamp_ms: T0 + DAY }));
    expect(await loadEntitlement(db, u)).toMatchObject({ state: "active", willRenew: true, accessUntil: new Date(T0 + 60 * DAY) });
    expect((await ledger(u)).payments).toBe(2); // both real charges are on the ledger
    expect((await eventRows(u)).some((r) => /stale/.test(r.error ?? ""))).toBe(true);
  });
});

describe("cancellation, expiration, grace, refund", () => {
  const paid = async (u: string) => processRevenueCatEvent(deps(), conversionEvent(u, T0, { original_transaction_id: `otx-${u}` }));

  it("cancel after conversion keeps access for the paid period; expiration ends it and marks the ledger subscription cancelled; payments stay", async () => {
    const u = await createAuthUser(pg);
    await paid(u);
    await processRevenueCatEvent(deps(), mapped(u, { type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", event_timestamp_ms: T0 + 5 * DAY, original_transaction_id: `otx-${u}` }));
    expect(hasPremium(await loadEntitlement(db, u), new Date(T0 + 29 * DAY))).toBe(true);
    await processRevenueCatEvent(deps({ now: () => new Date(T0 + 31 * DAY) }), mapped(u, { type: "EXPIRATION", event_timestamp_ms: T0 + 30 * DAY, original_transaction_id: `otx-${u}` }));
    expect(await loadEntitlement(db, u)).toMatchObject({ state: "expired" });
    const [s] = (await pg.query<{ status: string }>(`select status from subscriptions where user_id = $1`, [u])).rows;
    expect(s.status).toBe("cancelled");
    expect((await ledger(u)).payments).toBe(1); // history is permanent
  });

  it("billing issue with grace, then recovery by a successful charge", async () => {
    const u = await createAuthUser(pg);
    await paid(u);
    await processRevenueCatEvent(deps({ now: () => new Date(T0 + 30 * DAY) }), mapped(u, { type: "BILLING_ISSUE", event_timestamp_ms: T0 + 30 * DAY, grace_period_expiration_at_ms: T0 + 46 * DAY, original_transaction_id: `otx-${u}` }));
    expect(await loadEntitlement(db, u)).toMatchObject({ state: "grace", accessUntil: new Date(T0 + 46 * DAY) });
    const [g] = (await pg.query<{ status: string }>(`select status from subscriptions where user_id = $1`, [u])).rows;
    expect(g.status).toBe("grace");
    await processRevenueCatEvent(deps({ now: () => new Date(T0 + 32 * DAY) }), mapped(u, { type: "RENEWAL", event_timestamp_ms: T0 + 32 * DAY, purchased_at_ms: T0 + 32 * DAY, expiration_at_ms: T0 + 62 * DAY, original_transaction_id: `otx-${u}` }));
    expect(await loadEntitlement(db, u)).toMatchObject({ state: "active", accessUntil: new Date(T0 + 62 * DAY) });
    expect((await ledger(u)).payments).toBe(2);
  });

  it("a refund revokes access immediately and leaves the payment fact in place", async () => {
    const u = await createAuthUser(pg);
    await paid(u);
    await processRevenueCatEvent(deps({ now: () => new Date(T0 + 2 * DAY) }), mapped(u, { type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT", event_timestamp_ms: T0 + DAY, original_transaction_id: `otx-${u}` }));
    expect(await loadEntitlement(db, u)).toMatchObject({ state: "revoked" });
    expect(hasPremium(await loadEntitlement(db, u), new Date(T0 + 2 * DAY))).toBe(false);
    expect((await ledger(u)).payments).toBe(1);
  });
});

describe("events that cannot or must not be applied", () => {
  it("an event naming no known account is logged and ignored — it creates no entitlement and no ledger row", async () => {
    const ghost = crypto.randomUUID(); // a valid UUID that is not a user
    const out = await processRevenueCatEvent(deps(), trialEvent(ghost));
    expect(out).toMatchObject({ status: "ignored" });
    expect(await loadEntitlement(db, ghost)).toBeNull();
    const rows = (await pg.query<{ status: string; user_id: string | null }>(`select status, user_id from billing_events where app_user_id = $1`, [ghost])).rows;
    expect(rows).toEqual([{ status: "ignored", user_id: null }]);
  });

  it("an anonymous RevenueCat id is ignored the same way", async () => {
    const out = await processRevenueCatEvent(deps(), mapped("$RCAnonymousID:abc123", { id: "evt-anon" }));
    expect(out).toMatchObject({ status: "ignored", reason: "event names no Budgts user" });
  });

  it("ENVIRONMENT FENCE: a sandbox event on a production deployment is quarantined and applies nothing (and the reverse)", async () => {
    const u = await createAuthUser(pg);
    const sandbox = mapped(u, { environment: "SANDBOX", type: "RENEWAL", is_trial_conversion: true, original_transaction_id: `otx-${u}` });
    expect(await processRevenueCatEvent(deps({ environment: "production" }), sandbox)).toMatchObject({ status: "quarantined" });
    expect(await loadEntitlement(db, u)).toBeNull();
    expect(await ledger(u)).toEqual({ subscriptions: 0, payments: 0 });
    expect((await eventRows(u))[0].status).toBe("quarantined");
    const prod = mapped(u, { environment: "PRODUCTION", type: "RENEWAL", original_transaction_id: `otx-p-${u}` });
    expect(await processRevenueCatEvent(deps({ environment: "sandbox" }), prod)).toMatchObject({ status: "quarantined" });
    expect(await ledger(u)).toEqual({ subscriptions: 0, payments: 0 });
  });

  it("unsupported stores and ignorable events are logged as ignored with the reason", async () => {
    const u = await createAuthUser(pg);
    expect(await processRevenueCatEvent(deps(), mapped(u, { store: "STRIPE" }))).toMatchObject({ status: "ignored" });
    expect(await processRevenueCatEvent(deps(), mapped(u, { type: "TEST" }))).toMatchObject({ status: "ignored", reason: "RevenueCat test event" });
    expect(await loadEntitlement(db, u)).toBeNull();
  });
});

describe("account deletion in progress", () => {
  it("a late charge is still ledgered (real money), but the entitlement is NOT recreated for a deleting account", async () => {
    const u = await createAuthUser(pg);
    await pg.query(`insert into account_deletions (user_id, state) values ($1, 'deleting')`, [u]);
    const out = await processRevenueCatEvent(deps(), conversionEvent(u, T0, { original_transaction_id: `otx-${u}` }));
    expect(out).toMatchObject({ status: "processed", charged: true, entitlementSkipped: "account_deleting" });
    expect(await loadEntitlement(db, u)).toBeNull();
    expect((await ledger(u)).payments).toBe(1);
  });
});

describe("failure is loud and atomic", () => {
  it("a real charge we cannot represent FAILS the event and writes nothing; a redelivery that CAN be represented then succeeds", async () => {
    const u = await createAuthUser(pg);
    const otx = `otx-${u}`;
    const bad = mapped(u, { id: "evt-retry-me", type: "RENEWAL", product_id: "mystery", expiration_at_ms: T0 + 90 * DAY, original_transaction_id: otx });
    expect(bad.chargeProblem).toBeTruthy();
    const failed = await processRevenueCatEvent(deps(), bad);
    expect(failed).toMatchObject({ status: "failed" });
    expect(await ledger(u)).toEqual({ subscriptions: 0, payments: 0 });
    expect(await loadEntitlement(db, u)).toBeNull();
    expect((await eventRows(u))).toEqual([{ status: "failed", event_type: "RENEWAL", error: expect.stringMatching(/cannot tell the plan/) }]);
    // once the product is recognisable, the SAME event id is reprocessed and completes
    const fixed = mapped(u, { id: "evt-retry-me", type: "RENEWAL", product_id: "budgts_monthly", original_transaction_id: otx });
    expect(await processRevenueCatEvent(deps(), fixed)).toMatchObject({ status: "processed", charged: true });
    expect((await ledger(u)).payments).toBe(1);
    expect((await eventRows(u)).map((r) => r.status)).toEqual(["processed"]);
  });

  it("a store subscription already recorded for ANOTHER account is refused (money never silently changes owner)", async () => {
    const a = await createAuthUser(pg);
    const b = await createAuthUser(pg);
    const otx = `otx-shared-${a}`;
    await processRevenueCatEvent(deps(), conversionEvent(a, T0, { original_transaction_id: otx }));
    const out = await processRevenueCatEvent(deps(), conversionEvent(b, T0 + 30 * DAY, { original_transaction_id: otx }));
    expect(out).toMatchObject({ status: "failed", error: expect.stringMatching(/another account/) });
    expect((await ledger(b)).payments).toBe(0);
  });

  it("ATOMIC: if the entitlement write fails after the ledger write, the payment rolls back too", async () => {
    const u = await createAuthUser(pg);
    const breaking: Db = {
      query: (text, params) => (/^\s*update entitlements/i.test(text) ? Promise.reject(new Error("simulated crash")) : db.query(text, params)),
      transaction: (fn) => db.transaction((tx) => fn({ ...tx, query: (text, params) => (/^\s*update entitlements/i.test(text) ? Promise.reject(new Error("simulated crash")) : tx.query(text, params)) })),
    };
    const out = await processRevenueCatEvent(deps({ db: breaking }), conversionEvent(u, T0, { original_transaction_id: `otx-${u}` }));
    expect(out).toMatchObject({ status: "failed", error: "simulated crash" });
    expect(await ledger(u)).toEqual({ subscriptions: 0, payments: 0 }); // nothing half-applied
    expect((await eventRows(u)).map((r) => r.status)).toEqual(["failed"]);
  });

  it("the ledger writer refuses a non-charge outright (defence in depth for the $0 trial)", async () => {
    const u = await createAuthUser(pg);
    await expect(
      recordPaidCharge(db, u, { provider: "revenuecat", store: "apple", platformSubscriptionId: "x", plan: "monthly", externalTransactionId: "t", kind: "initial", amountMinor: 0, currency: "USD", periodStart: new Date(), periodEnd: new Date(Date.now() + 1000), occurredAt: new Date(), raw: {} }),
    ).rejects.toThrow(/non-charge/);
  });
});

describe("out-of-order: a cancellation delivered BEFORE the purchase it follows", () => {
  it("still ends with the entitlement the user paid for, and asks for reconciliation so auto-renew is right", async () => {
    const u = await createAuthUser(pg);
    const otx = `otx-${u}`;
    // The cancellation (later in real time) arrives first, while we know nothing about this user.
    const cancel = await processRevenueCatEvent(deps({ now: () => new Date(T0 + 21 * DAY) }), mapped(u, { type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", event_timestamp_ms: T0 + 20 * DAY, original_transaction_id: otx }));
    expect(cancel).toMatchObject({ status: "processed", applied: false, needsReconcile: true });
    expect((await loadEntitlement(db, u))?.state).toBe("none");
    // ...then the conversion it followed. It must NOT be stale, and money is ledgered.
    const conv = await processRevenueCatEvent(deps({ now: () => new Date(T0 + 21 * DAY) }), conversionEvent(u, T0 + 14 * DAY, { original_transaction_id: otx }));
    expect(conv).toMatchObject({ status: "processed", applied: true, charged: true });
    expect(await loadEntitlement(db, u)).toMatchObject({ state: "active", accessUntil: new Date(T0 + 44 * DAY) });
    expect((await ledger(u)).payments).toBe(1);
  });
});
