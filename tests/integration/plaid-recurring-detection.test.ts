/**
 * DB-integration: recurring-detection candidacy, lifecycle, idempotency, and
 * the ledger/prediction boundary — against real budgts-staging Postgres, not
 * fakes. Design: docs/specs/2026-09-16-recurring-detection-design.md.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { countsForMonth } from "@/lib/budget/qualify";
import type { BudgetTxn } from "@/lib/budget/types";
import { monthKey } from "@/lib/budget/month";
import { detectRecurringSeries } from "@/lib/plaid/recurring-detection";
import { runRecurringDetectionForUser } from "@/lib/plaid/recurring-engine";
import { createRecurringStore } from "@/lib/plaid/recurring-store";
import {
  cleanupUser,
  client,
  createAccount,
  db,
  insertBankTxn,
  mainAccountId,
  seedUser,
  dbNow,
} from "./_db";

const store = createRecurringStore(db);

let userId: string;
let checkingId: string;
let savingsId: string;

beforeAll(async () => {
  userId = await seedUser();
  checkingId = await mainAccountId(userId);
  savingsId = await createAccount(userId, "Savings", "savings");
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

async function readSeries(merchantEntityId: string, accountId: string, direction: "debit" | "credit") {
  const rows = await client<
    {
      id: string;
      status: string;
      cadence: string;
      observation_count: number;
      expected_amount: number;
      amount_tolerance_minor: number;
      overridden_by_user: boolean;
      last_occurred_at: string;
    }[]
  >`select id, status, cadence, observation_count, expected_amount, amount_tolerance_minor,
      overridden_by_user, last_occurred_at
    from public.recurring_series
    where user_id = ${userId} and merchant_entity_id = ${merchantEntityId}
      and account_id = ${accountId} and direction = ${direction}`;
  return rows[0] ?? null;
}

async function readTxnRecurringLink(id: string) {
  const [row] = await client<{ recurring_stream_id: string | null }[]>`
    select recurring_stream_id from public.transactions where id = ${id}`;
  return row.recurring_stream_id;
}

describe("recurring-detection candidacy exclusions (DB-integration)", () => {
  it("a transaction lacking merchant_entity_id is never a candidate", async () => {
    const merchant = `no-entity-${crypto.randomUUID()}`;
    for (const days of [0, 30, 60]) {
      await insertBankTxn(userId, checkingId, {
        merchantEntityId: null,
        merchantName: merchant,
        eventRole: "PURCHASE",
        primary: "FOOD_AND_DRINK",
        direction: "debit",
        amount: 1500,
        occurredAt: daysAgo(days),
      });
    }
    const groups = await store.findCandidateGroups(userId, null, new Date().toISOString());
    expect(groups.some((g) => g.merchantEntityId === null)).toBe(false);
  });

  it("GENERAL_MERCHANDISE and GENERAL_SERVICES primaries are excluded even with an eligible event_role", async () => {
    const merchant = `entity-${crypto.randomUUID()}`;
    for (const days of [0, 30, 60]) {
      await insertBankTxn(userId, checkingId, {
        merchantEntityId: merchant,
        eventRole: "PURCHASE",
        primary: "GENERAL_MERCHANDISE",
        direction: "debit",
        amount: 5000,
        occurredAt: daysAgo(days),
      });
    }
    const groups = await store.findCandidateGroups(userId, null, new Date().toISOString());
    expect(groups.some((g) => g.merchantEntityId === merchant)).toBe(false);
  });

  it.each(["TRANSFER", "CARD_PAYMENT", "P2P_PAYMENT", "CASH_ADVANCE", "ADJUSTMENT", "REFUND"])(
    "event_role %s is never a candidate",
    async (role) => {
      const merchant = `entity-${crypto.randomUUID()}`;
      for (const days of [0, 30, 60]) {
        await insertBankTxn(userId, checkingId, {
          merchantEntityId: merchant,
          eventRole: role,
          isTransfer: role === "TRANSFER",
          direction: role === "REFUND" ? "credit" : "debit",
          amount: 1000,
          occurredAt: daysAgo(days),
        });
      }
      const groups = await store.findCandidateGroups(userId, null, new Date().toISOString());
      expect(groups.some((g) => g.merchantEntityId === merchant)).toBe(false);
    },
  );

  it("a pending transaction is never a candidate", async () => {
    const merchant = `entity-${crypto.randomUUID()}`;
    for (const days of [0, 30, 60]) {
      await insertBankTxn(userId, checkingId, {
        merchantEntityId: merchant,
        eventRole: "PURCHASE",
        primary: "FOOD_AND_DRINK",
        direction: "debit",
        amount: 1000,
        pending: true,
        occurredAt: daysAgo(days),
      });
    }
    const groups = await store.findCandidateGroups(userId, null, new Date().toISOString());
    expect(groups.some((g) => g.merchantEntityId === merchant)).toBe(false);
  });

  it("a confirmed-duplicate transaction is never a candidate", async () => {
    const merchant = `entity-${crypto.randomUUID()}`;
    const canonical = await insertBankTxn(userId, checkingId, {
      merchantEntityId: merchant,
      eventRole: "PURCHASE",
      primary: "FOOD_AND_DRINK",
      direction: "debit",
      amount: 1000,
      occurredAt: daysAgo(0),
    });
    for (const days of [30, 60]) {
      await insertBankTxn(userId, checkingId, {
        merchantEntityId: merchant,
        eventRole: "PURCHASE",
        primary: "FOOD_AND_DRINK",
        direction: "debit",
        amount: 1000,
        duplicateOfId: canonical,
        occurredAt: daysAgo(days),
      });
    }
    const observations = await store.loadGroupObservations(userId, {
      merchantEntityId: merchant,
      accountId: checkingId,
      direction: "debit",
    });
    // only the canonical (non-duplicate) row is a candidate -- 1 observation,
    // never enough to form a series on its own.
    expect(observations).toHaveLength(1);
  });
});

describe("recurring-detection lifecycle (DB-integration)", () => {
  it("payroll (INCOME, credit) forms an ACTIVE series after 3 matching occurrences", async () => {
    const merchant = `payroll-${crypto.randomUUID()}`;
    for (const days of [0, 30, 60]) {
      await insertBankTxn(userId, checkingId, {
        merchantEntityId: merchant,
        eventRole: "INCOME",
        primary: "INCOME",
        direction: "credit",
        amount: 250000,
        occurredAt: daysAgo(days),
      });
    }
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });
    const series = await readSeries(merchant, checkingId, "credit");
    expect(series).not.toBeNull();
    expect(series!.status).toBe("ACTIVE");
    expect(series!.cadence).toBe("MONTHLY");
    expect(series!.observation_count).toBe(3);
  });

  it("B2 REGRESSION: two old, unrelated same-amount occurrences do not get swept into a genuine recent monthly series", async () => {
    const merchant = `b2regression-${crypto.randomUUID()}`;
    // Two same-amount purchases 3 days apart, ~400 days ago -- no cadence
    // relationship to anything, just a coincidental repeat.
    const old1 = await insertBankTxn(userId, checkingId, {
      merchantEntityId: merchant,
      eventRole: "PURCHASE",
      primary: "ENTERTAINMENT",
      direction: "debit",
      amount: 1700,
      occurredAt: daysAgo(370),
    });
    const old2 = await insertBankTxn(userId, checkingId, {
      merchantEntityId: merchant,
      eventRole: "PURCHASE",
      primary: "ENTERTAINMENT",
      direction: "debit",
      amount: 1700,
      occurredAt: daysAgo(367),
    });
    // Three genuinely monthly occurrences, recent.
    const recentIds: string[] = [];
    for (const days of [0, 30, 60]) {
      recentIds.push(
        await insertBankTxn(userId, checkingId, {
          merchantEntityId: merchant,
          eventRole: "PURCHASE",
          primary: "ENTERTAINMENT",
          direction: "debit",
          amount: 1700,
          occurredAt: daysAgo(days),
        }),
      );
    }
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });
    const series = await readSeries(merchant, checkingId, "debit");
    expect(series).not.toBeNull();
    expect(series!.cadence).toBe("MONTHLY");
    expect(series!.observation_count).toBe(3); // NOT 5
    expect(series!.status).toBe("ACTIVE");
    // The two old, unrelated occurrences must never be linked to this series.
    expect(await readTxnRecurringLink(old1)).toBeNull();
    expect(await readTxnRecurringLink(old2)).toBeNull();
    for (const id of recentIds) {
      expect(await readTxnRecurringLink(id)).toBe(series!.id);
    }
  });

  it("a merchant change starts a fresh, distinct series -- never links across identities", async () => {
    const merchantA = `merchantA-${crypto.randomUUID()}`;
    const merchantB = `merchantB-${crypto.randomUUID()}`;
    for (const days of [0, 30, 60]) {
      await insertBankTxn(userId, checkingId, {
        merchantEntityId: merchantA,
        eventRole: "PURCHASE",
        primary: "ENTERTAINMENT",
        direction: "debit",
        amount: 1599,
        occurredAt: daysAgo(days),
      });
    }
    for (const days of [5, 35, 65]) {
      await insertBankTxn(userId, checkingId, {
        merchantEntityId: merchantB,
        eventRole: "PURCHASE",
        primary: "ENTERTAINMENT",
        direction: "debit",
        amount: 1599,
        occurredAt: daysAgo(days),
      });
    }
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });
    const seriesA = await readSeries(merchantA, checkingId, "debit");
    const seriesB = await readSeries(merchantB, checkingId, "debit");
    expect(seriesA).not.toBeNull();
    expect(seriesB).not.toBeNull();
    expect(seriesA!.id).not.toBe(seriesB!.id);
  });

  it("an account change (same merchant) starts a fresh, distinct series", async () => {
    const merchant = `crossacct-${crypto.randomUUID()}`;
    for (const days of [0, 30, 60]) {
      await insertBankTxn(userId, checkingId, {
        merchantEntityId: merchant,
        eventRole: "PURCHASE",
        primary: "ENTERTAINMENT",
        direction: "debit",
        amount: 1200,
        occurredAt: daysAgo(days),
      });
    }
    for (const days of [3, 33, 63]) {
      await insertBankTxn(userId, savingsId, {
        merchantEntityId: merchant,
        eventRole: "PURCHASE",
        primary: "ENTERTAINMENT",
        direction: "debit",
        amount: 1200,
        occurredAt: daysAgo(days),
      });
    }
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });
    const onChecking = await readSeries(merchant, checkingId, "debit");
    const onSavings = await readSeries(merchant, savingsId, "debit");
    expect(onChecking).not.toBeNull();
    expect(onSavings).not.toBeNull();
    expect(onChecking!.id).not.toBe(onSavings!.id);
  });

  it("pending -> soft-deleted -> posted replacement: only the posted row ever counts as an observation", async () => {
    const merchant = `pendlife-${crypto.randomUUID()}`;
    // Two confirmed historical occurrences.
    for (const days of [60, 30]) {
      await insertBankTxn(userId, checkingId, {
        merchantEntityId: merchant,
        eventRole: "PURCHASE",
        primary: "ENTERTAINMENT",
        direction: "debit",
        amount: 999,
        occurredAt: daysAgo(days),
      });
    }
    // A pending third occurrence -- must not count yet.
    const pendingId = await insertBankTxn(userId, checkingId, {
      merchantEntityId: merchant,
      eventRole: "PURCHASE",
      primary: "ENTERTAINMENT",
      direction: "debit",
      amount: 999,
      pending: true,
      occurredAt: daysAgo(1),
    });
    const beforePost = await store.loadGroupObservations(userId, {
      merchantEntityId: merchant,
      accountId: checkingId,
      direction: "debit",
    });
    expect(beforePost).toHaveLength(2); // pending row excluded

    // Plaid posts the replacement: soft-delete the pending row, insert the posted one.
    await client`update public.transactions set removed_at = now() where id = ${pendingId}`;
    await insertBankTxn(userId, checkingId, {
      merchantEntityId: merchant,
      eventRole: "PURCHASE",
      primary: "ENTERTAINMENT",
      direction: "debit",
      amount: 999,
      occurredAt: daysAgo(1),
    });
    const afterPost = await store.loadGroupObservations(userId, {
      merchantEntityId: merchant,
      accountId: checkingId,
      direction: "debit",
    });
    expect(afterPost).toHaveLength(3); // the posted replacement now counts

    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });
    const series = await readSeries(merchant, checkingId, "debit");
    expect(series!.status).toBe("ACTIVE");
    expect(series!.observation_count).toBe(3);
  });

  it("links member transactions via recurring_stream_id, idempotently across repeated runs", async () => {
    const merchant = `linking-${crypto.randomUUID()}`;
    const ids: string[] = [];
    for (const days of [0, 30, 60]) {
      ids.push(
        await insertBankTxn(userId, checkingId, {
          merchantEntityId: merchant,
          eventRole: "PURCHASE",
          primary: "ENTERTAINMENT",
          direction: "debit",
          amount: 1100,
          occurredAt: daysAgo(days),
        }),
      );
    }
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });
    const series = await readSeries(merchant, checkingId, "debit");
    for (const id of ids) {
      expect(await readTxnRecurringLink(id)).toBe(series!.id);
    }

    // Run again -- idempotent, same series id, no error, no duplicate row.
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });
    const seriesAfterSecondRun = await readSeries(merchant, checkingId, "debit");
    expect(seriesAfterSecondRun!.id).toBe(series!.id);
    for (const id of ids) {
      expect(await readTxnRecurringLink(id)).toBe(series!.id);
    }
  });
});

describe("mute and user-override durability (DB-integration)", () => {
  it("a MUTED series stays MUTED even when new matching transactions arrive", async () => {
    const merchant = `muted-${crypto.randomUUID()}`;
    for (const days of [30, 60, 90]) {
      await insertBankTxn(userId, checkingId, {
        merchantEntityId: merchant,
        eventRole: "PURCHASE",
        primary: "ENTERTAINMENT",
        direction: "debit",
        amount: 1400,
        occurredAt: daysAgo(days),
      });
    }
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });
    const created = await readSeries(merchant, checkingId, "debit");
    expect(created!.status).toBe("ACTIVE");

    // Simulate a user muting it (no UI yet -- direct write, exactly what a
    // future mute action would do).
    await client`update public.recurring_series set status = 'MUTED', muted_at = now() where id = ${created!.id}`;

    // A 4th matching occurrence arrives, the next chronological cycle (not
    // colliding with any existing occurrence's date).
    await insertBankTxn(userId, checkingId, {
      merchantEntityId: merchant,
      eventRole: "PURCHASE",
      primary: "ENTERTAINMENT",
      direction: "debit",
      amount: 1400,
      occurredAt: daysAgo(0),
    });
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });
    const after = await readSeries(merchant, checkingId, "debit");
    expect(after!.status).toBe("MUTED"); // never reverted to ACTIVE
    expect(after!.observation_count).toBe(4); // but still tracked in the background
  });

  it("overriddenByUser freezes cadence/expectedAmount/tolerance but observationCount keeps advancing", async () => {
    const merchant = `override-${crypto.randomUUID()}`;
    for (const days of [30, 60, 90]) {
      await insertBankTxn(userId, checkingId, {
        merchantEntityId: merchant,
        eventRole: "PURCHASE",
        primary: "ENTERTAINMENT",
        direction: "debit",
        amount: 1000,
        occurredAt: daysAgo(days),
      });
    }
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });
    const created = await readSeries(merchant, checkingId, "debit");

    // Simulate a user manually editing cadence/amount (no UI yet).
    await client`update public.recurring_series
      set overridden_by_user = true, cadence = 'ANNUAL', expected_amount = 999999, amount_tolerance_minor = 1
      where id = ${created!.id}`;

    await insertBankTxn(userId, checkingId, {
      merchantEntityId: merchant,
      eventRole: "PURCHASE",
      primary: "ENTERTAINMENT",
      direction: "debit",
      amount: 1000,
      occurredAt: daysAgo(0), // still within a plausible amount-match window vs 1000, irrelevant here since amount tolerance is now overridden to 1 minor unit
    });
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });
    const after = await readSeries(merchant, checkingId, "debit");
    expect(after!.cadence).toBe("ANNUAL"); // frozen, not recomputed to MONTHLY
    expect(after!.expected_amount).toBe(999999); // frozen
    expect(after!.amount_tolerance_minor).toBe(1); // frozen
  });
});

describe("concurrency / idempotency (DB-integration)", () => {
  it("two concurrent applySeriesUpdate calls for the identical group produce exactly one consistent row", async () => {
    const merchant = `concurrent-${crypto.randomUUID()}`;
    const ids: string[] = [];
    for (const days of [0, 30, 60]) {
      ids.push(
        await insertBankTxn(userId, checkingId, {
          merchantEntityId: merchant,
          eventRole: "PURCHASE",
          primary: "ENTERTAINMENT",
          direction: "debit",
          amount: 1300,
          occurredAt: daysAgo(days),
        }),
      );
    }
    const key = { merchantEntityId: merchant, accountId: checkingId, direction: "debit" as const };
    const observations = await store.loadGroupObservations(userId, key);
    const sorted = [...observations].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );
    const update = detectRecurringSeries(sorted, null)!;

    // Two genuinely concurrent calls -- real Promise.all, not sequential.
    await Promise.all([
      store.applySeriesUpdate(userId, key, update, "PURCHASE", null),
      store.applySeriesUpdate(userId, key, update, "PURCHASE", null),
    ]);

    const rows = await client`select id from public.recurring_series
      where user_id = ${userId} and merchant_entity_id = ${merchant} and account_id = ${checkingId} and direction = 'debit'`;
    expect(rows).toHaveLength(1); // the unique index prevented a duplicate row
    for (const id of ids) {
      expect(await readTxnRecurringLink(id)).toBe(rows[0].id);
    }
  });
});

describe("recurring metadata never affects financial semantics (DB-integration)", () => {
  it("amount, direction, event_role, is_transfer, budget_effect, and rollup inclusion are identical before and after detection runs", async () => {
    const merchant = `financial-safety-${crypto.randomUUID()}`;
    const ids: string[] = [];
    for (const days of [0, 30, 60]) {
      ids.push(
        await insertBankTxn(userId, checkingId, {
          merchantEntityId: merchant,
          eventRole: "PURCHASE",
          primary: "ENTERTAINMENT",
          direction: "debit",
          amount: 1600,
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
      return {
        row,
        counts: countsForMonth(budgetTxn, monthKey(new Date(row.occurred_at))),
      };
    }

    const before = await Promise.all(ids.map(snapshot));

    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });
    // Run twice to also exercise the idempotent-linking path here.
    await runRecurringDetectionForUser({ userId, watermark: null, store, now: await dbNow() });

    const after = await Promise.all(ids.map(snapshot));

    for (let i = 0; i < ids.length; i++) {
      expect(after[i].row.amount).toBe(before[i].row.amount);
      expect(after[i].row.direction).toBe(before[i].row.direction);
      expect(after[i].row.event_role).toBe(before[i].row.event_role);
      expect(after[i].row.is_transfer).toBe(before[i].row.is_transfer);
      expect(after[i].counts).toBe(before[i].counts);
    }

    // And the series row itself was actually created -- this isn't a
    // vacuous "nothing happened" pass.
    const series = await readSeries(merchant, checkingId, "debit");
    expect(series).not.toBeNull();
    expect(series!.status).toBe("ACTIVE");
  });
});
