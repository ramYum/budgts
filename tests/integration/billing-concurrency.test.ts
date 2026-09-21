/**
 * Billing under REAL concurrency: real staging Postgres, several real connections (postgres-js pool), synthetic
 * users. The PGlite suites prove the logic on one connection; only separate sessions can prove the locking and the
 * unique-index guards actually serialize racing workers.
 *
 * Covered:
 *   1. reminder claim      — N workers race for one due reminder: exactly one wins.
 *   2. reminder sweeps     — several sweeps run at once over many users: each user is delivered exactly once.
 *   3. delivery failure    — a failed delivery releases the claim and never touches subscription state.
 *   4. duplicate webhooks  — the same event delivered N times at once: applied once, ledgered once.
 *   5. same transaction id — different event ids for one store transaction: one payment.
 *   6. mixed ordering      — trial start, conversion and cancellation racing: no lost money, no failed event.
 */
import { afterAll, describe, expect, it } from "vitest";
import { fromPostgres } from "@/lib/billing/db";
import { claimReminder, findDueReminderUserIds, runReminderSweep, type ReminderDelivery, type ReminderPayload } from "@/lib/billing/reminders";
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
  for (const id of users) await cleanupUser(id);
});

const TRIAL_END = new Date(T0 + 14 * DAY);
const NOW = new Date(TRIAL_END.getTime() - 6 * 3_600_000); // inside the last 24h of the trial
const once = <T>(n: number, fn: (i: number) => Promise<T>) => Promise.all(Array.from({ length: n }, (_, i) => fn(i)));

async function seedTrial(userId: string) {
  await db.query(
    `insert into entitlements (user_id, state, provider, store, product_id, will_renew, trial_started_at, trial_ends_at, access_until, renewal_price_amount, renewal_price_currency)
     values ($1,'trialing','revenuecat','apple','budgts_monthly',true,$2,$3,$3,999,'USD')`,
    [userId, new Date(T0), TRIAL_END],
  );
}
const uniqueOtx = () => `otx-${crypto.randomUUID()}`;
const paymentCount = async (userId: string) => (await db.query<{ n: number }>(`select count(*)::int n from payments where user_id = $1`, [userId]))[0].n;
const eventStatuses = async (userId: string) => (await db.query<{ status: string }>(`select status from billing_events where user_id = $1`, [userId])).map((r) => r.status);

describe("reminder claim under concurrent workers", () => {
  it("exactly one of 20 simultaneous claims for the same user wins", async () => {
    const u = await newUser();
    await seedTrial(u);
    const results = await once(20, () => claimReminder(db, u, NOW));
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect((await loadEntitlement(db, u))?.reminderClaimedAt).not.toBeNull();
  });

  it("concurrent sweeps deliver each due user exactly once", async () => {
    const mine = await Promise.all(Array.from({ length: 12 }, () => newUser()));
    for (const u of mine) await seedTrial(u);
    const delivered = new Map<string, number>();
    const delivery: ReminderDelivery = {
      async deliver(p: ReminderPayload) {
        // Widen the race window: a claimed-but-not-yet-marked reminder must still not be claimable by a second worker.
        await new Promise((r) => setTimeout(r, 25));
        if (mine.includes(p.userId)) delivered.set(p.userId, (delivered.get(p.userId) ?? 0) + 1);
      },
    };
    await Promise.all([1, 2, 3, 4].map(() => runReminderSweep({ db, delivery, now: () => NOW })));
    for (const u of mine) expect(delivered.get(u), u).toBe(1);
    // and a later sweep finds nothing left for them
    const still = await findDueReminderUserIds(db, NOW, 500);
    expect(still.filter((id) => mine.includes(id))).toEqual([]);
  });

  it("a failed delivery releases the claim, retries later, and never changes subscription state", async () => {
    const u = await newUser();
    await seedTrial(u);
    const before = await loadEntitlement(db, u);
    const failing: ReminderDelivery = { deliver: async () => { throw new Error("provider down"); } };
    await runReminderSweep({ db, delivery: failing, now: () => NOW });
    const after = await loadEntitlement(db, u);
    expect(after).toMatchObject({ state: before?.state, willRenew: before?.willRenew, accessUntil: before?.accessUntil, trialEndsAt: before?.trialEndsAt });
    expect(after?.reminderSentAt).toBeNull();
    expect(after?.reminderClaimedAt).toBeNull(); // released: the next run may retry
    const ok: ReminderDelivery = { deliver: async () => {} };
    const retry = await runReminderSweep({ db, delivery: ok, now: () => NOW });
    expect(retry.sent).toBeGreaterThanOrEqual(1);
    expect((await loadEntitlement(db, u))?.reminderSentAt).not.toBeNull();
  });
});

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
