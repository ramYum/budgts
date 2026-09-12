/**
 * DB-integration: the real PlaidSyncStore against budgts-staging Postgres.
 * Synthetic fixtures only — no Plaid. Proves the SQL, jsonb/enum column
 * mapping, the transaction, the 23505 dedupe catch, soft-deletes, and the
 * cursor / item-status write.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SyncPlan } from "@/lib/plaid/apply-sync";
import { createPlaidSyncStore } from "@/lib/plaid/sync-store";
import type { PlaidNormalizedTxn } from "@/lib/plaid/types";
import { categoryIdByName, cleanupUser, client, db, mainAccountId, seedUser } from "./_db";

const store = createPlaidSyncStore(db);
const ITEM_ID = `itest-item-${Date.now()}`;

let userId: string;
let accountId: string;
let plaidAccountRowId: string;
let foodCat: string;
let entCat: string;

function txn(over: Partial<PlaidNormalizedTxn> = {}): PlaidNormalizedTxn {
  return {
    accountId,
    plaidAccountRowId,
    categoryId: foodCat,
    amount: 1599,
    direction: "debit",
    occurredAt: "2026-09-08T00:00:00.000Z",
    description: "Synthetic Coffee",
    note: null,
    isTransfer: false,
    source: "bank",
    sourceRef: "itest-txn-1",
    userCategorized: false,
    status: "confirmed",
    pending: false,
    pendingSourceRef: null,
    merchantName: "Synthetic Coffee",
    merchantEntityId: "itest-ent-1",
    plaidCategoryPrimary: "FOOD_AND_DRINK",
    plaidCategoryDetailed: "FOOD_AND_DRINK_COFFEE",
    plaidPfcConfidence: "HIGH",
    authorizedAt: "2026-09-07T22:00:00.000Z",
    raw: { synthetic: true, transaction_id: "itest-txn-1" },
    ...over,
  };
}
const plan = (over: Partial<SyncPlan> = {}): SyncPlan => ({ inserts: [], updates: [], softDeletes: [], ...over });
const meta = (cursor: string) => ({ itemId: ITEM_ID, cursor });

async function txnRow(sourceRef: string) {
  const [row] = await client`
    select * from public.transactions where user_id = ${userId} and source = 'bank' and source_ref = ${sourceRef}`;
  return row;
}
async function txnCount() {
  const [row] = await client<{ n: string }[]>`
    select count(*)::text n from public.transactions where user_id = ${userId} and source = 'bank'`;
  return Number(row.n);
}

beforeAll(async () => {
  userId = await seedUser();
  accountId = await mainAccountId(userId);
  foodCat = await categoryIdByName(userId, "Food / Groceries");
  entCat = await categoryIdByName(userId, "Entertainment");
  const [item] = await client<{ id: string }[]>`
    insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status, needs_sync)
    values (${userId}, ${ITEM_ID}, 'Synthetic Bank', 'enc-blob', 'active', true) returning id`;
  const [pa] = await client<{ id: string }[]>`
    insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name)
    values (${userId}, ${item.id}, 'itest-pa-1', ${accountId}, 'mapped', 'Checking') returning id`;
  plaidAccountRowId = pa.id;
});

afterAll(async () => {
  await cleanupUser(userId);
  await client.end();
});

describe("PlaidSyncStore.applyPlan (staging Postgres)", () => {
  it("inserts a normalized bank txn with every Plaid column, and advances the cursor + clears needs_sync", async () => {
    const res = await store.applyPlan(userId, plan({ inserts: [txn()] }), meta("cursor-1"));
    expect(res).toEqual({ inserts: 1, updates: 0, softDeletes: 0 });

    const row = await txnRow("itest-txn-1");
    expect(row).toMatchObject({
      source: "bank",
      account_id: accountId,
      plaid_account_id: plaidAccountRowId,
      category_id: foodCat,
      amount: 1599,
      direction: "debit",
      status: "confirmed",
      is_transfer: false,
      pending: false,
      pending_plaid_transaction_id: null,
      merchant_name: "Synthetic Coffee",
      merchant_entity_id: "itest-ent-1",
      plaid_category_primary: "FOOD_AND_DRINK",
      plaid_pfc_confidence: "HIGH",
      user_categorized: false,
      removed_at: null,
      transfer_pair_id: null,
      recurring_stream_id: null,
    });
    expect(row.raw).toEqual({ synthetic: true, transaction_id: "itest-txn-1" });

    const [item] = await client`select transactions_cursor, needs_sync, last_synced_at, sync_failures from public.plaid_items where item_id = ${ITEM_ID}`;
    expect(item.transactions_cursor).toBe("cursor-1");
    expect(item.needs_sync).toBe(false);
    expect(item.last_synced_at).not.toBeNull();
    expect(item.sync_failures).toBe(0);
  });

  it("is idempotent — re-applying the same insert hits the unique index and does not duplicate", async () => {
    const before = await txnCount();
    const res = await store.applyPlan(userId, plan({ inserts: [txn({ amount: 9999 })] }), meta("cursor-2"));
    expect(res.inserts).toBe(0);
    expect(await txnCount()).toBe(before);
    const row = await txnRow("itest-txn-1");
    expect(row.amount).toBe(1599); // unchanged — the winning row stands
  });

  it("applies a field patch by row id", async () => {
    const row = await txnRow("itest-txn-1");
    await store.applyPlan(
      userId,
      plan({
        updates: [
          {
            id: row.id,
            patch: {
              amount: 1234,
              direction: "debit",
              occurredAt: "2026-09-09T00:00:00.000Z",
              description: "Synthetic Coffee (adj)",
              status: "confirmed",
              pending: false,
              merchantName: "Synthetic Coffee",
              merchantEntityId: "itest-ent-1",
              plaidCategoryPrimary: "FOOD_AND_DRINK",
              plaidCategoryDetailed: "FOOD_AND_DRINK_COFFEE",
              plaidPfcConfidence: "HIGH",
              authorizedAt: null,
              raw: { synthetic: true, v: 2 },
              categoryId: entCat,
              isTransfer: false,
            },
          },
        ],
      }),
      meta("cursor-3"),
    );
    const after = await txnRow("itest-txn-1");
    expect(after.amount).toBe(1234);
    expect(after.description).toBe("Synthetic Coffee (adj)");
    expect(after.category_id).toBe(entCat);
    expect(after.authorized_at).toBeNull();
  });

  it("soft-deletes by stamping removed_at, and never twice", async () => {
    const row = await txnRow("itest-txn-1");
    const r1 = await store.applyPlan(userId, plan({ softDeletes: [row.id] }), meta("cursor-4"));
    expect(r1.softDeletes).toBe(1);
    expect((await txnRow("itest-txn-1")).removed_at).not.toBeNull();

    // isNull guard: a second soft-delete touches 0 rows
    await store.applyPlan(userId, plan({ softDeletes: [row.id] }), meta("cursor-5"));
    // still removed, single removal — nothing throws
    expect((await txnRow("itest-txn-1")).removed_at).not.toBeNull();
  });

  it("lands a currency-mismatch insert as pending_review", async () => {
    await store.applyPlan(
      userId,
      plan({ inserts: [txn({ sourceRef: "itest-txn-eur", status: "pending_review", description: "€ thing" })] }),
      meta("cursor-6"),
    );
    expect((await txnRow("itest-txn-eur")).status).toBe("pending_review");
  });

  it("findBySourceRefs returns the reducer's view of existing rows", async () => {
    const rows = await store.findBySourceRefs(userId, ["itest-txn-1", "itest-txn-eur", "nope"]);
    const byRef = Object.fromEntries(rows.map((r) => [r.source_ref, r]));
    expect(Object.keys(byRef).sort()).toEqual(["itest-txn-1", "itest-txn-eur"]);
    expect(byRef["itest-txn-1"]).toMatchObject({ user_categorized: false, is_transfer: false });
    expect(byRef["itest-txn-1"].removed_at).not.toBeNull(); // soft-deleted earlier
    expect(byRef["itest-txn-eur"].removed_at).toBeNull();
  });

  it("findBySourceRefs is scoped to the user (no cross-tenant leak)", async () => {
    const other = await seedUser();
    try {
      const rows = await store.findBySourceRefs(other, ["itest-txn-1", "itest-txn-eur"]);
      expect(rows).toEqual([]);
    } finally {
      await cleanupUser(other);
    }
  });

  // Regression: production hit "RangeError: Maximum call stack size exceeded"
  // from Drizzle's inArray() query builder when a single sync pass aggregated
  // ~9,000 touched refs before ever calling the DB (a Plaid institution with
  // heavy pending/posted churn). BATCH_SIZE is 500, so 1,200 rows forces 3
  // batches through insert, findBySourceRefs, and soft-delete alike.
  const BIG_N = 1200;

  it("handles a batch far larger than one Plaid page without crashing (insert, find, soft-delete)", async () => {
    const bigRefs = Array.from({ length: BIG_N }, (_, i) => `itest-big-${i}`);
    const bigInserts = bigRefs.map((sourceRef, i) => txn({ sourceRef, amount: 100 + i }));

    const insertRes = await store.applyPlan(userId, plan({ inserts: bigInserts }), meta("cursor-big-1"));
    expect(insertRes.inserts).toBe(BIG_N);
    expect(await txnCount()).toBeGreaterThanOrEqual(BIG_N);

    const found = await store.findBySourceRefs(userId, [...bigRefs, "does-not-exist"]);
    expect(found).toHaveLength(BIG_N);

    const ids = found.map((r) => r.id);
    const deleteRes = await store.applyPlan(userId, plan({ softDeletes: ids }), meta("cursor-big-2"));
    expect(deleteRes.softDeletes).toBe(BIG_N);

    const stillThere = await store.findBySourceRefs(userId, bigRefs);
    expect(stillThere.every((r) => r.removed_at !== null)).toBe(true);
  });
});
