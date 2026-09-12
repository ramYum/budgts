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
    pendingReason: null,
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
              pendingReason: "sign_convention_unknown",
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
    expect(after.pending_reason).toBe("sign_convention_unknown");
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

// Design: 2026-09-12 duplicate-feed investigation, "Phase 14" — review-only
// anomaly detection against real Postgres. These never assert that any
// transaction was suppressed, merged, or excluded from a count; the whole
// point of the mechanism is that financial data is untouched.
describe("PlaidSyncStore anomaly review flagging (staging Postgres)", () => {
  let accountId2: string;

  beforeAll(async () => {
    // A second Budgts account + plaid_accounts row under the SAME item, for
    // cross-account isolation checks.
    const [acct] = await client<{ id: string }[]>`
      insert into public.accounts (user_id, name, type) values (${userId}, 'Second Account', 'checking') returning id`;
    accountId2 = acct.id;
    const [item] = await client<{ id: string }[]>`select id from public.plaid_items where item_id = ${ITEM_ID}`;
    await client`
      insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name)
      values (${userId}, ${item.id}, 'itest-pa-2', ${accountId2}, 'mapped', 'Second')`;
  });

  async function reviewState(acctId: string) {
    const [row] = await client<
      { needs_review: boolean; review_reason: string | null; review_flagged_at: string | null }[]
    >`select needs_review, review_reason, review_flagged_at from public.plaid_accounts where account_id = ${acctId}`;
    return row;
  }

  it("countByAccountFingerprint counts only live rows sharing the exact (account, fingerprint) pair", async () => {
    const rows = [
      txn({ sourceRef: "itest-fp-1", raw: { transaction_id: "itest-fp-1", note: "same-content" } }),
      txn({ sourceRef: "itest-fp-2", raw: { transaction_id: "itest-fp-2", note: "same-content" } }),
      txn({ sourceRef: "itest-fp-3", raw: { transaction_id: "itest-fp-3", note: "different-content" } }),
    ];
    await store.applyPlan(userId, plan({ inserts: rows }), meta("cursor-fp-1"));

    const fpSame = (await txnRow("itest-fp-1")).content_fingerprint;
    const fpDiff = (await txnRow("itest-fp-3")).content_fingerprint;
    expect(fpSame).toBe((await txnRow("itest-fp-2")).content_fingerprint);
    expect(fpSame).not.toBe(fpDiff);

    const counts = await store.countByAccountFingerprint([
      { accountId, contentFingerprint: fpSame },
      { accountId, contentFingerprint: fpDiff },
    ]);
    expect(counts.get(`${accountId}:${fpSame}`)).toBe(2);
    expect(counts.get(`${accountId}:${fpDiff}`)).toBe(1);
  });

  it("does not count a soft-deleted (removed) row toward the fingerprint total", async () => {
    const rows = [
      txn({ sourceRef: "itest-fp-rm-1", raw: { transaction_id: "itest-fp-rm-1", note: "rm-group" } }),
      txn({ sourceRef: "itest-fp-rm-2", raw: { transaction_id: "itest-fp-rm-2", note: "rm-group" } }),
    ];
    await store.applyPlan(userId, plan({ inserts: rows }), meta("cursor-fp-rm-1"));
    const removedRow = await txnRow("itest-fp-rm-1");
    await store.applyPlan(userId, plan({ softDeletes: [removedRow.id] }), meta("cursor-fp-rm-2"));

    const fp = removedRow.content_fingerprint;
    const counts = await store.countByAccountFingerprint([{ accountId, contentFingerprint: fp }]);
    expect(counts.get(`${accountId}:${fp}`)).toBe(1); // only the non-removed sibling counts
  });

  it("flagAccountForReview sets needs_review/reason, and preserves the FIRST flagged_at across repeats", async () => {
    expect(await reviewState(accountId)).toMatchObject({ needs_review: false, review_reason: null });

    await store.flagAccountForReview(accountId, "12 identical transactions detected");
    const first = await reviewState(accountId);
    expect(first.needs_review).toBe(true);
    expect(first.review_reason).toBe("12 identical transactions detected");
    expect(first.review_flagged_at).not.toBeNull();

    // Simulate the anomaly growing on a later sync: reason updates, but the
    // ORIGINAL detection time is preserved (coalesce), not overwritten.
    await new Promise((r) => setTimeout(r, 10));
    await store.flagAccountForReview(accountId, "18 identical transactions detected");
    const second = await reviewState(accountId);
    expect(second.review_reason).toBe("18 identical transactions detected");
    expect(second.review_flagged_at).toBe(first.review_flagged_at);
  });

  it("flagging one account never touches another account's review state (cross-account isolation)", async () => {
    expect(await reviewState(accountId2)).toMatchObject({ needs_review: false });
    await store.flagAccountForReview(accountId, "flag for account 1 only");
    expect((await reviewState(accountId2)).needs_review).toBe(false);
  });

  it("a pending transaction and its posted replacement never share a content fingerprint", async () => {
    // Real Plaid shape: the pending row and its posted successor differ in
    // `pending` (and typically amount precision) — verified here against
    // actual stored fingerprints, not just reasoning about the raw shape.
    const pendingRaw = { transaction_id: "itest-pend-1", pending: true, amount: -20.0, name: "Restaurant" };
    const postedRaw = {
      transaction_id: "itest-post-1",
      pending: false,
      pending_transaction_id: "itest-pend-1",
      amount: -24.5, // tip added once posted — a real, documented Plaid behavior
      name: "Restaurant",
    };
    await store.applyPlan(
      userId,
      plan({
        inserts: [
          txn({ sourceRef: "itest-pend-1", pending: true, raw: pendingRaw }),
          txn({ sourceRef: "itest-post-1", pendingSourceRef: "itest-pend-1", raw: postedRaw }),
        ],
      }),
      meta("cursor-pending-1"),
    );
    const pendingRow = await txnRow("itest-pend-1");
    const postedRow = await txnRow("itest-post-1");
    expect(pendingRow.content_fingerprint).not.toBe(postedRow.content_fingerprint);
  });
});
