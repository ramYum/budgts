/**
 * Billing under REAL concurrency: real staging Postgres, several real connections (postgres-js pool), synthetic
 * users. The PGlite suites prove the logic on one connection; only separate sessions can prove the locking and the
 * unique-index guards actually serialize racing workers.
 *
 * Covered:
 *   1. duplicate webhooks  — the same event delivered N times at once: applied once, ledgered once.
 *   2. same transaction id — different event ids for one store transaction: one payment.
 *   3. mixed ordering      — trial start, conversion and cancellation racing: no lost money, no failed event.
 *
 * (Reminder-claim/sweep concurrency was covered here before the trial-end reminder was removed from V1 on
 * 2026-09-22; that coverage went with the feature.)
 */
import { afterAll, describe, expect, it } from "vitest";
import { fromPostgres } from "@/lib/billing/db";
import { processRevenueCatEvent } from "@/lib/billing/processor";
import { conversionEvent, DAY, mapped, T0, trialEvent } from "@/lib/billing/revenuecat/fixtures";
import { loadEntitlement } from "@/lib/billing/store";
import { cleanupUser, client, seedUser } from "./_db";

const db = fromPostgres(client);
const users: string[] = [];
const newUser = async () => {
  const id = await seedUser();
  users.push(id);
  return id;
};
afterAll(async () => {
  // A user with a real payment on the ledger cannot be hard-deleted (RESTRICT + immutable ledger: production anonymizes
  // such accounts instead). These are synthetic itest users, so leaving the de-identifiable few behind is harmless.
  for (const id of users) await cleanupUser(id).catch(() => {});
});

const once = <T>(n: number, fn: (i: number) => Promise<T>) => Promise.all(Array.from({ length: n }, (_, i) => fn(i)));

const uniqueOtx = () => `otx-${crypto.randomUUID()}`;
const paymentCount = async (userId: string) => (await db.query<{ n: number }>(`select count(*)::int n from payments where user_id = $1`, [userId]))[0].n;
const eventStatuses = async (userId: string) => (await db.query<{ status: string }>(`select status from billing_events where user_id = $1`, [userId])).map((r) => r.status);

describe("webhook processing under concurrent delivery", () => {
  const deps = { db, environment: "production" as const, now: () => new Date(T0 + 20 * DAY) };

  it("the same event delivered 8 times at once is applied and ledgered exactly once", async () => {
    const u = await newUser();
    const otx = uniqueOtx();
    const event = conversionEvent(u, T0 + 14 * DAY, { original_transaction_id: otx });
    const outcomes = await once(8, () => processRevenueCatEvent(deps, event));
    expect(outcomes.filter((o) => o.status === "processed")).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === "duplicate")).toHaveLength(7);
    expect(await paymentCount(u)).toBe(1);
    expect((await db.query<{ n: number }>(`select count(*)::int n from billing_events where user_id = $1`, [u]))[0].n).toBe(1);
    expect(await loadEntitlement(db, u)).toMatchObject({ state: "active" });
  });

  it("one store transaction under different event ids is ledgered once", async () => {
    const u = await newUser();
    const otx = uniqueOtx();
    const tx = `tx-${crypto.randomUUID()}`;
    const events = Array.from({ length: 6 }, () => conversionEvent(u, T0 + 14 * DAY, { original_transaction_id: otx, transaction_id: tx }));
    const outcomes = await once(events.length, (i) => processRevenueCatEvent(deps, events[i]));
    expect(outcomes.every((o) => o.status === "processed")).toBe(true);
    expect(await paymentCount(u)).toBe(1);
    expect(await eventStatuses(u)).toEqual(Array(6).fill("processed"));
  });

  it("trial start, conversion and cancellation racing never lose the charge or fail an event", async () => {
    const u = await newUser();
    const otx = uniqueOtx();
    const batch = [
      trialEvent(u, T0, { original_transaction_id: otx }),
      conversionEvent(u, T0 + 14 * DAY, { original_transaction_id: otx }),
      mapped(u, { type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", event_timestamp_ms: T0 + 20 * DAY, original_transaction_id: otx }),
    ];
    const outcomes = await Promise.all(batch.map((e) => processRevenueCatEvent(deps, e)));
    expect(outcomes.some((o) => o.status === "failed")).toBe(false);
    expect(await paymentCount(u)).toBe(1); // money that moved is a fact, in whatever order the events arrived
    expect((await eventStatuses(u)).every((s) => s === "processed")).toBe(true);
    // Every ordering ends with the user holding what they paid for.
    expect(await loadEntitlement(db, u)).toMatchObject({ state: "active" });
  });
});
