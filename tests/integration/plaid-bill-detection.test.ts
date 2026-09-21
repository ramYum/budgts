/**
 * DB-integration: bill detection as a classification layer over real
 * recurring_series output — against real budgts-staging Postgres, not
 * fakes. Design: docs/specs/2026-09-17-bill-detection-design.md. Mirrors
 * plaid-subscription-detection.test.ts's structure exactly.
 *
 * No new schema, no persisted classification (see the design doc) — these
 * tests prove the real end-to-end plumbing produces the same
 * recurring_series/transaction outcome as before, and that the bill
 * classification signal fires (via structured logging) only when it
 * genuinely should, with subscription classification taking precedence.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { countsForMonth } from "@/lib/budget/qualify";
import type { BudgetTxn } from "@/lib/budget/types";
import { monthKey } from "@/lib/budget/month";
import { runRecurringDetectionForUser } from "@/lib/plaid/recurring-engine";
import { createRecurringStore } from "@/lib/plaid/recurring-store";
import { cleanupUser, client, db, insertBankTxn, mainAccountId, seedUser, dbNow } from "./_db";

const store = createRecurringStore(db);

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

afterEach(() => {
  vi.restoreAllMocks();
});

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

async function readSeries(merchantEntityId: string, accountId: string, direction: "debit" | "credit") {
  const rows = await client<
    { id: string; status: string; cadence: string; observation_count: number }[]
  >`select id, status, cadence, observation_count
    from public.recurring_series
    where user_id = ${userId} and merchant_entity_id = ${merchantEntityId}
      and account_id = ${accountId} and direction = ${direction}`;
  return rows[0] ?? null;
}

/** Filters to logs for one specific merchant -- the shared test user
 * accumulates recurring_series across every test in this file (real
 * end-to-end runs, not per-test isolation), so a bare "any log fired"
 * check would false-positive on an EARLIER test's still-ACTIVE series
 * being re-evaluated on a later run. Same helper shape as
 * plaid-subscription-detection.test.ts's `subscriptionLogsFor`. */
function logsFor(spy: { mock: { calls: unknown[][] } }, label: string, merchantEntityId: string) {
  return spy.mock.calls.filter(
    (call) => call[0] === label && (call[1] as { merchantEntityId?: string })?.merchantEntityId === merchantEntityId,
  );
}

describe("bill detection (DB-integration)", () => {
  it("a real ACTIVE RENT_AND_UTILITIES/internet-shaped series logs a bill-detection line, with recurring_series output unaffected", async () => {
    const merchant = `bill-internet-${crypto.randomUUID()}`;
    for (const days of [0, 30, 60]) {
      await insertBankTxn(userId, checkingId, {
        merchantEntityId: merchant,
        eventRole: "PURCHASE",
        primary: "RENT_AND_UTILITIES",
        detailed: "RENT_AND_UTILITIES_INTERNET_AND_CABLE",
        direction: "debit",
        amount: 8900,
        occurredAt: daysAgo(days),
      });
    }

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });

    const series = await readSeries(merchant, checkingId, "debit");
    expect(series).not.toBeNull();
    expect(series!.status).toBe("ACTIVE");
    expect(series!.cadence).toBe("MONTHLY");
    expect(series!.observation_count).toBe(3);

    const billLogs = logsFor(logSpy, "[plaid] bill-detection", merchant);
    expect(billLogs).toHaveLength(1);
    expect(billLogs[0][1]).toMatchObject({ userId, merchantEntityId: merchant, accountId: checkingId });

    const subLogs = logsFor(logSpy, "[plaid] subscription-detection", merchant);
    expect(subLogs).toHaveLength(0);
  });

  it("a real ACTIVE Entertainment/streaming-shaped series logs subscription-detection and never bill-detection (precedence holds end-to-end)", async () => {
    const merchant = `bill-precedence-streaming-${crypto.randomUUID()}`;
    for (const days of [0, 30, 60]) {
      await insertBankTxn(userId, checkingId, {
        merchantEntityId: merchant,
        eventRole: "PURCHASE",
        primary: "ENTERTAINMENT",
        detailed: "ENTERTAINMENT_TV_AND_MOVIES",
        direction: "debit",
        amount: 1599,
        occurredAt: daysAgo(days),
      });
    }

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });

    const series = await readSeries(merchant, checkingId, "debit");
    expect(series).not.toBeNull();
    expect(series!.status).toBe("ACTIVE");

    const subLogs = logsFor(logSpy, "[plaid] subscription-detection", merchant);
    const billLogs = logsFor(logSpy, "[plaid] bill-detection", merchant);
    expect(subLogs).toHaveLength(1);
    expect(billLogs).toHaveLength(0);
  });

  it("a real ACTIVE general-category series (no trusted subtype) never logs bill-detection or subscription-detection", async () => {
    const merchant = `bill-general-${crypto.randomUUID()}`;
    for (const days of [0, 30, 60]) {
      await insertBankTxn(userId, checkingId, {
        merchantEntityId: merchant,
        eventRole: "PURCHASE",
        primary: "TRANSPORTATION",
        detailed: "TRANSPORTATION_GAS",
        direction: "debit",
        amount: 4500,
        occurredAt: daysAgo(days),
      });
    }

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });

    const series = await readSeries(merchant, checkingId, "debit");
    expect(series).not.toBeNull();
    expect(series!.status).toBe("ACTIVE");

    const billLogs = logsFor(logSpy, "[plaid] bill-detection", merchant);
    const subLogs = logsFor(logSpy, "[plaid] subscription-detection", merchant);
    expect(billLogs).toHaveLength(0);
    expect(subLogs).toHaveLength(0);
  });

  it("a real ACTIVE RENT_AND_UTILITIES/rent series (annual-shaped amount, monthly cadence) logs bill-detection correctly", async () => {
    const merchant = `bill-rent-${crypto.randomUUID()}`;
    for (const days of [0, 30, 60]) {
      await insertBankTxn(userId, checkingId, {
        merchantEntityId: merchant,
        eventRole: "PURCHASE",
        primary: "RENT_AND_UTILITIES",
        detailed: "RENT_AND_UTILITIES_RENT",
        direction: "debit",
        amount: 150000,
        occurredAt: daysAgo(days),
      });
    }

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });

    const series = await readSeries(merchant, checkingId, "debit");
    expect(series).not.toBeNull();
    expect(series!.status).toBe("ACTIVE");

    const billLogs = logsFor(logSpy, "[plaid] bill-detection", merchant);
    expect(billLogs).toHaveLength(1);
  });

  it("financial fields and countsForMonth are unchanged for a classified-bill series' member transactions", async () => {
    const merchant = `bill-financial-safety-${crypto.randomUUID()}`;
    const ids: string[] = [];
    for (const days of [0, 30, 60]) {
      ids.push(
        await insertBankTxn(userId, checkingId, {
          merchantEntityId: merchant,
          eventRole: "PURCHASE",
          primary: "RENT_AND_UTILITIES",
          detailed: "RENT_AND_UTILITIES_WATER",
          direction: "debit",
          amount: 6500,
          occurredAt: daysAgo(days),
        }),
      );
    }

    async function snapshot(id: string) {
      const [row] = await client<
        {
          amount: number;
          direction: "debit" | "credit";
          event_role: string | null;
          is_transfer: boolean;
          occurred_at: string;
          status: "confirmed" | "pending_review";
          duplicate_of_id: string | null;
          transfer_user_set: boolean;
          category_id: string | null;
        }[]
      >`select amount, direction, event_role, is_transfer, occurred_at, status, duplicate_of_id,
          transfer_user_set, category_id
        from public.transactions where id = ${id}`;
      const budgetTxn: BudgetTxn = {
        categoryId: row.category_id,
        amount: row.amount,
        direction: row.direction,
        occurredAt: new Date(row.occurred_at),
        status: row.status,
        isTransfer: row.is_transfer,
        duplicateOfId: row.duplicate_of_id,
        eventRole: row.event_role as BudgetTxn["eventRole"],
        transferUserSet: row.transfer_user_set,
        accountExcluded: false,
      };
      return { row, counts: countsForMonth(budgetTxn, monthKey(new Date(row.occurred_at))) };
    }

    const before = await Promise.all(ids.map(snapshot));

    vi.spyOn(console, "log").mockImplementation(() => {});
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });

    const after = await Promise.all(ids.map(snapshot));

    for (let i = 0; i < ids.length; i++) {
      expect(after[i].row.amount).toBe(before[i].row.amount);
      expect(after[i].row.direction).toBe(before[i].row.direction);
      expect(after[i].row.event_role).toBe(before[i].row.event_role);
      expect(after[i].row.is_transfer).toBe(before[i].row.is_transfer);
      expect(after[i].counts).toBe(before[i].counts);
    }
  });

  it("idempotency: running the scan twice against the same bill-shaped data produces the same classification and no additional recurring_series writes", async () => {
    const merchant = `bill-idempotent-${crypto.randomUUID()}`;
    for (const days of [0, 30, 60]) {
      await insertBankTxn(userId, checkingId, {
        merchantEntityId: merchant,
        eventRole: "PURCHASE",
        primary: "RENT_AND_UTILITIES",
        detailed: "RENT_AND_UTILITIES_TELEPHONE",
        direction: "debit",
        amount: 5500,
        occurredAt: daysAgo(days),
      });
    }

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });
    const seriesAfterFirst = await readSeries(merchant, checkingId, "debit");

    // Second run with watermark null again -- same re-scan semantics an
    // accidental duplicate cron invocation would have.
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });
    const seriesAfterSecond = await readSeries(merchant, checkingId, "debit");

    expect(seriesAfterSecond!.id).toBe(seriesAfterFirst!.id);
    expect(seriesAfterSecond!.observation_count).toBe(seriesAfterFirst!.observation_count);

    const billLogs = logsFor(logSpy, "[plaid] bill-detection", merchant);
    expect(billLogs).toHaveLength(2); // fires once per run, both classifying the same way
  });
});
