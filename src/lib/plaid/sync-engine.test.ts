import { describe, expect, it, vi } from "vitest";
import { UnknownPfcPrimaryError } from "./category-map";
import { type SyncPlan } from "./apply-sync";
import {
  type PlaidSyncPage,
  type PlaidSyncStore,
  type PlaidTxnRow,
  runSync,
  SyncMutationDuringPagination,
  type SyncDeps,
} from "./sync-engine";
import type { AccountMapEntry, NormalizeCtx, PlaidTxnInput } from "./types";

const ACCT = "plaid-acct-1";
const accountMap = new Map<string, AccountMapEntry>([
  [ACCT, { plaidAccountRowId: "pa-1", budgtsAccountId: "b-acct-1", ignored: false }],
]);

const normalizeCtx: NormalizeCtx = {
  accountMap,
  currency: "USD",
  resolveCategory: ({ primary }) => {
    if (primary === "FOOD_AND_DRINK") return "cat-food";
    if (primary === "WEIRD") throw new UnknownPfcPrimaryError("WEIRD");
    return null;
  },
};

function pTxn(over: Partial<PlaidTxnInput> = {}): PlaidTxnInput {
  return {
    transaction_id: "t1",
    account_id: ACCT,
    amount: 10,
    iso_currency_code: "USD",
    unofficial_currency_code: null,
    date: "2026-09-08",
    name: "Store",
    merchant_name: "Store",
    merchant_entity_id: "ent",
    pending: false,
    pending_transaction_id: null,
    personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "X", confidence_level: "HIGH" },
    ...over,
  };
}

function page(over: Partial<PlaidSyncPage> = {}): PlaidSyncPage {
  return { added: [], modified: [], removed: [], next_cursor: "c1", has_more: false, ...over };
}

function fakeStore(existing: PlaidTxnRow[] = []) {
  const calls: { findRefs: string[][]; plans: Array<{ plan: SyncPlan; meta: unknown }> } = {
    findRefs: [],
    plans: [],
  };
  const store: PlaidSyncStore = {
    async findBySourceRefs(_u, refs) {
      calls.findRefs.push(refs);
      return existing.filter((r) => refs.includes(r.source_ref));
    },
    async applyPlan(_u, plan, meta) {
      calls.plans.push({ plan, meta });
      return { inserts: plan.inserts.length, updates: plan.updates.length, softDeletes: plan.softDeletes.length };
    },
  };
  return { store, calls };
}

const deps = (over: Partial<SyncDeps>): SyncDeps => ({
  userId: "u1",
  itemId: "item-1",
  initialCursor: null,
  transactionsSync: async () => page(),
  store: fakeStore().store,
  normalizeCtx,
  ...over,
});

describe("runSync", () => {
  it("initial sync: single page, lands the added transactions and persists the cursor", async () => {
    const { store, calls } = fakeStore();
    const out = await runSync(
      deps({
        store,
        transactionsSync: async () => page({ added: [pTxn({ transaction_id: "a1" }), pTxn({ transaction_id: "a2" })], next_cursor: "cursor-A" }),
      }),
    );
    expect(out.applied).toEqual({ inserts: 2, updates: 0, softDeletes: 0, skipped: 0 });
    expect(out.cursor).toBe("cursor-A");
    expect(out.hasMore).toBe(false);
    expect(calls.plans[0].meta).toEqual({ itemId: "item-1", cursor: "cursor-A" });
  });

  it("paginates: follows has_more, passing next_cursor each time, then stops", async () => {
    const sync = vi
      .fn<SyncDeps["transactionsSync"]>()
      .mockResolvedValueOnce(page({ added: [pTxn({ transaction_id: "a1" })], next_cursor: "c1", has_more: true }))
      .mockResolvedValueOnce(page({ added: [pTxn({ transaction_id: "a2" })], next_cursor: "c2", has_more: true }))
      .mockResolvedValueOnce(page({ added: [pTxn({ transaction_id: "a3" })], next_cursor: "c3", has_more: false }));
    const { store, calls } = fakeStore();
    const out = await runSync(deps({ store, initialCursor: "c0", transactionsSync: sync }));

    expect(sync.mock.calls.map((c) => c[0].cursor)).toEqual(["c0", "c1", "c2"]);
    expect(out.cursor).toBe("c3");
    expect(calls.plans[0].plan.inserts).toHaveLength(3);
  });

  it("caps pages per run and reports hasMore", async () => {
    const sync = vi
      .fn<SyncDeps["transactionsSync"]>()
      .mockResolvedValue(page({ added: [pTxn()], next_cursor: "cN", has_more: true }));
    const out = await runSync(deps({ transactionsSync: sync, maxPagesPerRun: 3 }));
    expect(sync).toHaveBeenCalledTimes(3);
    expect(out.hasMore).toBe(true);
    expect(out.cursor).toBe("cN");
  });

  it("restarts from initialCursor on a mutation-during-pagination error", async () => {
    let call = 0;
    const sync: SyncDeps["transactionsSync"] = async ({ cursor }) => {
      call++;
      if (call === 1) return page({ added: [pTxn({ transaction_id: "a1" })], next_cursor: "mid", has_more: true });
      if (call === 2) throw new SyncMutationDuringPagination(); // blew up mid-pagination
      // restart: fetch again from the original cursor
      expect(cursor).toBe("c0");
      return page({ added: [pTxn({ transaction_id: "a1" }), pTxn({ transaction_id: "a2" })], next_cursor: "final", has_more: false });
    };
    const { store, calls } = fakeStore();
    const out = await runSync(deps({ store, initialCursor: "c0", transactionsSync: sync }));
    expect(out.restarts).toBe(1);
    expect(out.cursor).toBe("final");
    expect(calls.plans[0].plan.inserts.map((i) => i.sourceRef)).toEqual(["a1", "a2"]); // no dup from the partial first attempt
  });

  it("gives up after maxRestarts and rethrows", async () => {
    const sync: SyncDeps["transactionsSync"] = async () => {
      throw new SyncMutationDuringPagination();
    };
    await expect(runSync(deps({ transactionsSync: sync, maxRestarts: 2 }))).rejects.toBeInstanceOf(
      SyncMutationDuringPagination,
    );
  });

  it("rethrows a non-mutation error immediately", async () => {
    const sync: SyncDeps["transactionsSync"] = async () => {
      throw new Error("PLAID 500");
    };
    await expect(runSync(deps({ transactionsSync: sync }))).rejects.toThrow("PLAID 500");
  });

  it("loads existing rows by source_ref + pending refs, then applies the reducer", async () => {
    const existing: PlaidTxnRow[] = [
      { id: "row-pend", source_ref: "pend-1", user_categorized: true, category_id: "cat-user", note: null, is_transfer: false, removed_at: null },
    ];
    const { store, calls } = fakeStore(existing);
    const out = await runSync(
      deps({
        store,
        transactionsSync: async () =>
          page({
            added: [pTxn({ transaction_id: "post-1", pending_transaction_id: "pend-1" })],
            removed: [{ transaction_id: "pend-1" }],
          }),
      }),
    );
    expect(calls.findRefs[0].sort()).toEqual(["pend-1", "post-1"]);
    const plan = calls.plans[0].plan;
    expect(plan.inserts[0]).toMatchObject({ sourceRef: "post-1", categoryId: "cat-user", userCategorized: true });
    expect(plan.softDeletes).toEqual(["row-pend"]);
    expect(out.applied.inserts).toBe(1);
  });

  it("collects skips (ignored / zero-amount / unknown account) without failing the run", async () => {
    const out = await runSync(
      deps({
        transactionsSync: async () =>
          page({
            added: [
              pTxn({ transaction_id: "ok" }),
              pTxn({ transaction_id: "zero", amount: 0 }),
              pTxn({ transaction_id: "ghost", account_id: "not-mapped" }),
            ],
          }),
      }),
    );
    expect(out.applied.inserts).toBe(1);
    expect(out.applied.skipped).toBe(2);
    expect(out.skips).toEqual(
      expect.arrayContaining([
        { transactionId: "zero", reason: "zero-amount" },
        { transactionId: "ghost", reason: "unknown-account" },
      ]),
    );
  });

  it("a no-change incremental sync still advances + persists the cursor", async () => {
    const { store, calls } = fakeStore();
    const out = await runSync(
      deps({ store, initialCursor: "old", transactionsSync: async () => page({ next_cursor: "new", has_more: false }) }),
    );
    expect(out.applied).toEqual({ inserts: 0, updates: 0, softDeletes: 0, skipped: 0 });
    expect(calls.plans).toHaveLength(1);
    expect(calls.plans[0].meta).toEqual({ itemId: "item-1", cursor: "new" });
  });
});
