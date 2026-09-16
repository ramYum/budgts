/**
 * DB-integration: subscription detection as a classification layer over
 * real recurring_series output — against real budgts-staging Postgres, not
 * fakes. Design: docs/specs/2026-09-16-subscription-detection-design.md.
 *
 * No new schema, no persisted classification in this first implementation
 * (see the design doc) — these tests prove the real end-to-end plumbing
 * (loadGroupObservations now also fetching category evidence) produces the
 * same recurring_series/transaction outcome as before, and that the
 * classification signal fires (via structured logging) only when it
 * genuinely should.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { countsForMonth } from "@/lib/budget/qualify";
import type { BudgetTxn } from "@/lib/budget/types";
import { monthKey } from "@/lib/budget/month";
import { runRecurringDetectionForUser } from "@/lib/plaid/recurring-engine";
import { createRecurringStore } from "@/lib/plaid/recurring-store";
import { cleanupUser, client, db, insertBankTxn, mainAccountId, seedUser } from "./_db";

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
 * end-to-end runs, not per-test isolation), so a bare "any subscription
 * log fired" check would false-positive on an EARLIER test's still-ACTIVE
 * series being re-evaluated on a later run. */
function subscriptionLogsFor(spy: { mock: { calls: unknown[][] } }, merchantEntityId: string) {
  return spy.mock.calls.filter(
    (call) =>
      call[0] === "[plaid] subscription-detection" &&
      (call[1] as { merchantEntityId?: string })?.merchantEntityId === merchantEntityId,
  );
}

describe("subscription detection (DB-integration)", () => {
  it("a real ACTIVE Entertainment/streaming-shaped series logs a subscription-detection line, with recurring_series output unaffected", async () => {
    const merchant = `sub-streaming-${crypto.randomUUID()}`;
    const ids: string[] = [];
    for (const days of [0, 30, 60]) {
      ids.push(
        await insertBankTxn(userId, checkingId, {
          merchantEntityId: merchant,
          eventRole: "PURCHASE",
          primary: "ENTERTAINMENT",
          detailed: "ENTERTAINMENT_TV_AND_MOVIES",
          direction: "debit",
          amount: 1599,
          occurredAt: daysAgo(days),
        }),
      );
    }

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runRecurringDetectionForUser({ userId, watermark: null, store });

    const series = await readSeries(merchant, checkingId, "debit");
    expect(series).not.toBeNull();
    expect(series!.status).toBe("ACTIVE");
    expect(series!.cadence).toBe("MONTHLY");
    expect(series!.observation_count).toBe(3);

    const subLogs = subscriptionLogsFor(logSpy, merchant);
    expect(subLogs).toHaveLength(1);
    expect(subLogs[0][1]).toMatchObject({ userId, merchantEntityId: merchant, accountId: checkingId });
  });

  it("a real ACTIVE RENT_AND_UTILITIES series never logs a subscription-detection line", async () => {
    const merchant = `sub-utility-${crypto.randomUUID()}`;
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
    await runRecurringDetectionForUser({ userId, watermark: null, store });

    const series = await readSeries(merchant, checkingId, "debit");
    expect(series).not.toBeNull();
    expect(series!.status).toBe("ACTIVE"); // recurring detection itself is unaffected

    const subLogs = subscriptionLogsFor(logSpy, merchant);
    expect(subLogs).toHaveLength(0);
  });

  it("a real ACTIVE general-category series (no trusted detailed subtype) never logs a subscription-detection line", async () => {
    const merchant = `sub-general-${crypto.randomUUID()}`;
    for (const days of [0, 30, 60]) {
      await insertBankTxn(userId, checkingId, {
        merchantEntityId: merchant,
        eventRole: "PURCHASE",
        primary: "ENTERTAINMENT",
        detailed: "ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS",
        direction: "debit",
        amount: 4500,
        occurredAt: daysAgo(days),
      });
    }

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runRecurringDetectionForUser({ userId, watermark: null, store });

    const series = await readSeries(merchant, checkingId, "debit");
    expect(series).not.toBeNull();
    expect(series!.status).toBe("ACTIVE");

    const subLogs = subscriptionLogsFor(logSpy, merchant);
    expect(subLogs).toHaveLength(0);
  });

  it("financial fields and countsForMonth are unchanged for a classified-subscription series' member transactions", async () => {
    const merchant = `sub-financial-safety-${crypto.randomUUID()}`;
    const ids: string[] = [];
    for (const days of [0, 30, 60]) {
      ids.push(
        await insertBankTxn(userId, checkingId, {
          merchantEntityId: merchant,
          eventRole: "PURCHASE",
          primary: "PERSONAL_CARE",
          detailed: "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS",
          direction: "debit",
          amount: 4999,
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
    await runRecurringDetectionForUser({ userId, watermark: null, store });

    const after = await Promise.all(ids.map(snapshot));

    for (let i = 0; i < ids.length; i++) {
      expect(after[i].row.amount).toBe(before[i].row.amount);
      expect(after[i].row.direction).toBe(before[i].row.direction);
      expect(after[i].row.event_role).toBe(before[i].row.event_role);
      expect(after[i].row.is_transfer).toBe(before[i].row.is_transfer);
      expect(after[i].counts).toBe(before[i].counts);
    }
  });
});
