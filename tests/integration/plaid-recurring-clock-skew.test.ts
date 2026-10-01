/**
 * DB-integration regression: the recurring scan window is measured on ONE
 * clock, the database's. `transactions.created_at` is stamped by Postgres
 * `now()` (the inserting transaction's start time), so the scan's upper bound
 * and the persisted watermark come from the database clock too, never the app
 * server's, and the next scan's lower bound reaches back far enough to catch a
 * sync transaction that started before a scan and committed after it.
 *
 * Found 2026-09-30: this machine's clock ran ~300 ms behind staging's, which
 * hid freshly inserted rows from the scan and failed 16 detection tests.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runRecurringDetectionForUser } from "@/lib/plaid/recurring-engine";
import { createRecurringStore, loadRecurringWatermark } from "@/lib/plaid/recurring-store";
import { cleanupUser, client, db, insertBankTxn, mainAccountId, seedUser } from "./_db";

const store = createRecurringStore(db);
const SKEW_MS = 5_000;
let userId: string;
let checkingId: string;

beforeAll(async () => {
  userId = await seedUser();
  checkingId = await mainAccountId(userId);
});

afterAll(async () => {
  await cleanupUser(userId);
  await client.end();
});

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

/** Runs `fn` with the app server's clock (JS `Date`) skewed by `ms` from the
 * database clock, which is what an unsynced app host looks like. */
async function withAppClockSkew<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  const RealDate = Date;
  const realNow = RealDate.now.bind(RealDate);
  class SkewedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(realNow() + ms);
      else super(...(args as [string]));
    }
    static now() {
      return realNow() + ms;
    }
  }
  globalThis.Date = SkewedDate as DateConstructor;
  try {
    return await fn();
  } finally {
    globalThis.Date = RealDate;
  }
}

const MONTHLY = {
  eventRole: "PURCHASE",
  primary: "ENTERTAINMENT",
  direction: "debit" as const,
  amount: 1500,
};

async function insertMonthly(merchant: string, days: number) {
  await insertBankTxn(userId, checkingId, { merchantEntityId: merchant, ...MONTHLY, occurredAt: daysAgo(days) });
}

async function readSeries(merchant: string) {
  const [row] = await client<{ status: string; observation_count: number }[]>`
    select status, observation_count from public.recurring_series
    where user_id = ${userId} and merchant_entity_id = ${merchant}`;
  return row ?? null;
}

describe("recurring scan window vs app-server clock skew (DB-integration)", () => {
  it("app clock BEHIND the database: rows just inserted still form a series", async () => {
    const merchant = `skew-behind-${crypto.randomUUID()}`;
    for (const days of [0, 30, 60]) await insertMonthly(merchant, days);
    await withAppClockSkew(-SKEW_MS, () => runRecurringDetectionForUser({ userId, watermark: null, store }));
    const series = await readSeries(merchant);
    expect(series).not.toBeNull();
    expect(series!.status).toBe("ACTIVE");
  });

  it("app clock AHEAD of the database: a row landing after the scan is picked up by the next scan", async () => {
    const merchant = `skew-ahead-${crypto.randomUUID()}`;
    for (const days of [30, 60, 90]) await insertMonthly(merchant, days);
    await withAppClockSkew(SKEW_MS, () => runRecurringDetectionForUser({ userId, watermark: null, store }));
    expect((await readSeries(merchant))!.observation_count).toBe(3);

    await insertMonthly(merchant, 0); // lands after the first scan finished
    const watermark = await loadRecurringWatermark(db, userId);
    await withAppClockSkew(SKEW_MS, () => runRecurringDetectionForUser({ userId, watermark, store }));
    expect((await readSeries(merchant))!.observation_count).toBe(4);
  });

  it("a sync transaction that started before a scan and committed after it is picked up by the next scan", async () => {
    const merchant = `in-flight-${crypto.randomUUID()}`;
    for (const days of [30, 60, 90]) await insertMonthly(merchant, days);

    // The sync's transaction starts, so its rows' created_at is THIS instant...
    await client.begin(async (tx) => {
      await tx`
        insert into public.transactions
          (user_id, account_id, amount, direction, occurred_at, description, source, source_ref,
           merchant_entity_id, event_role, plaid_category_primary, status, pending)
        values
          (${userId}, ${checkingId}, ${MONTHLY.amount}, ${MONTHLY.direction}, ${daysAgo(0)}, 'itest in-flight',
           'bank', ${`itest-${crypto.randomUUID()}`}, ${merchant}, ${MONTHLY.eventRole}, ${MONTHLY.primary},
           'confirmed', false)`;
      // ...a scan runs to completion while it is still uncommitted (invisible)... (Both scans run with the app
      // clock ahead, so this test fails for the in-flight reason alone whatever the host clock's own skew is: an
      // app-clock watermark then lands after the committed rows, and only the overlap brings the late row back.)
      await withAppClockSkew(SKEW_MS, () => runRecurringDetectionForUser({ userId, watermark: null, store }));
      expect((await readSeries(merchant))!.observation_count).toBe(3);
    });
    // ...and it commits with created_at EARLIER than the watermark that scan saved.

    const watermark = await loadRecurringWatermark(db, userId);
    await withAppClockSkew(SKEW_MS, () => runRecurringDetectionForUser({ userId, watermark, store }));
    expect((await readSeries(merchant))!.observation_count).toBe(4);
  });

  it("the saved watermark never moves backwards when overlapping scans finish out of order", async () => {
    const later = "2099-01-01T12:00:00.000Z"; // after any real scan this file ran
    const earlier = "2099-01-01T11:00:00.000Z";
    await store.markScanned(userId, later); // the scan that started later finishes first...
    await store.markScanned(userId, earlier); // ...then the one that started earlier finishes
    expect(await loadRecurringWatermark(db, userId)).toBe(later);

    const next = "2099-01-01T13:00:00.000Z";
    await store.markScanned(userId, next); // a genuinely newer scan still advances it
    expect(await loadRecurringWatermark(db, userId)).toBe(next);
  });
});
