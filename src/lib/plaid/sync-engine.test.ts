import { describe, expect, it, vi } from "vitest";
import { UnknownPfcPrimaryError } from "./category-map";
import { computeContentFingerprint } from "./content-fingerprint";
import { type SyncPlan } from "./apply-sync";
import { AMBIGUOUS_REVIEW_SAMPLE_THRESHOLD, MIN_EVIDENCE_SAMPLES } from "./sign-convention";
import {
  ANOMALY_REVIEW_THRESHOLD,
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
  [ACCT, { plaidAccountRowId: "pa-1", budgtsAccountId: "b-acct-1", ignored: false, signConvention: "standard" }],
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

function fakeStore(
  existing: PlaidTxnRow[] = [],
  initialFingerprintCounts: Record<string, number> = {},
  initialSignEvidence: Record<string, { rawAmount: number; primary: string | null }[]> = {},
) {
  const calls: {
    findRefs: string[][];
    plans: Array<{ plan: SyncPlan; meta: unknown }>;
    flags: Array<{ accountId: string; reason: string }>;
    // keyed by `plaid_accounts.id` — the connected feed, NOT the Budgts account
    finalizedSignConventions: Array<{ plaidAccountRowId: string; convention: "standard" | "inverted" }>;
  } = { findRefs: [], plans: [], flags: [], finalizedSignConventions: [] };
  // Simulates "live rows per (accountId:fingerprint), post-insert" — the same
  // semantics the real Drizzle-backed store computes with one query after the
  // insert transaction commits. Persists across calls on the SAME fakeStore
  // instance, so a test can call runSync twice to exercise cross-sync
  // accumulation.
  const fingerprintCounts = new Map(Object.entries(initialFingerprintCounts));
  const signEvidence = new Map(
    Object.entries(initialSignEvidence).map(([k, v]) => [k, [...v]]),
  );
  const store: PlaidSyncStore = {
    async findBySourceRefs(_u, refs) {
      calls.findRefs.push(refs);
      return existing.filter((r) => refs.includes(r.source_ref));
    },
    async applyPlan(_u, plan, meta) {
      calls.plans.push({ plan, meta });
      for (const n of plan.inserts) {
        const key = `${n.accountId}:${computeContentFingerprint(n.raw)}`;
        fingerprintCounts.set(key, (fingerprintCounts.get(key) ?? 0) + 1);
      }
      return { inserts: plan.inserts.length, updates: plan.updates.length, softDeletes: plan.softDeletes.length };
    },
    async countByAccountFingerprint(pairs) {
      const out = new Map<string, number>();
      for (const p of pairs) {
        const key = `${p.accountId}:${p.contentFingerprint}`;
        out.set(key, fingerprintCounts.get(key) ?? 0);
      }
      return out;
    },
    async flagAccountForReview(accountId, reason) {
      calls.flags.push({ accountId, reason });
    },
    async getSignConventionEvidence(plaidAccountRowIds) {
      const out = new Map<string, { rawAmount: number; primary: string | null }[]>();
      for (const id of plaidAccountRowIds) out.set(id, signEvidence.get(id) ?? []);
      return out;
    },
    async finalizeSignConvention(plaidAccountRowId, convention) {
      calls.finalizedSignConventions.push({ plaidAccountRowId, convention });
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
      { id: "row-pend", source_ref: "pend-1", user_categorized: true, category_id: "cat-user", note: null, is_transfer: false, removed_at: null, status: "confirmed", pending_reason: null },
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

  describe("anomaly review flagging (design: 2026-09-12 — review-only, never suppresses)", () => {
    it("does NOT flag a legitimate small repeat (2 identical-content transactions)", async () => {
      const { store, calls } = fakeStore();
      const out = await runSync(
        deps({
          store,
          transactionsSync: async () =>
            page({
              added: [pTxn({ transaction_id: "r1" }), pTxn({ transaction_id: "r2" })],
            }),
        }),
      );
      expect(out.applied.inserts).toBe(2); // both land, fully counted
      expect(calls.flags).toEqual([]);
    });

    it("flags the account when a single sync batch reaches the threshold, but still lands every row", async () => {
      const { store, calls } = fakeStore();
      const added = Array.from({ length: ANOMALY_REVIEW_THRESHOLD }, (_, i) => pTxn({ transaction_id: `dup-${i}` }));
      const out = await runSync(deps({ store, transactionsSync: async () => page({ added }) }));

      expect(out.applied.inserts).toBe(ANOMALY_REVIEW_THRESHOLD); // nothing suppressed
      expect(calls.flags).toHaveLength(1);
      expect(calls.flags[0].accountId).toBe("b-acct-1");
      expect(calls.flags[0].reason).toContain(String(ANOMALY_REVIEW_THRESHOLD));
    });

    it("flags via CROSS-SYNC accumulation — a lone transaction now, then enough later syncs cross the threshold", async () => {
      const { store, calls } = fakeStore();

      // First sync: 1 copy. Below threshold, no flag yet.
      const first = await runSync(
        deps({ store, transactionsSync: async () => page({ added: [pTxn({ transaction_id: "seed" })] }) }),
      );
      expect(first.applied.inserts).toBe(1);
      expect(calls.flags).toEqual([]);

      // Second, separate sync call: enough MORE identical-content arrivals to
      // cross the threshold when combined with the one already landed.
      const more = Array.from({ length: ANOMALY_REVIEW_THRESHOLD - 1 }, (_, i) => pTxn({ transaction_id: `more-${i}` }));
      const second = await runSync(deps({ store, transactionsSync: async () => page({ added: more }) }));

      expect(second.applied.inserts).toBe(ANOMALY_REVIEW_THRESHOLD - 1); // all land — no suppression
      expect(calls.flags).toHaveLength(1); // flagged only once the cumulative total crossed the line
    });

    it("never combines two different accounts' identical-content transactions into one anomaly", async () => {
      const acctMap2 = new Map(accountMap);
      acctMap2.set("plaid-acct-2", { plaidAccountRowId: "pa-2", budgtsAccountId: "b-acct-2", ignored: false, signConvention: "standard" });
      const ctx2: NormalizeCtx = { ...normalizeCtx, accountMap: acctMap2 };

      const { store, calls } = fakeStore();
      const half = Math.floor(ANOMALY_REVIEW_THRESHOLD / 2);
      const added = [
        ...Array.from({ length: half }, (_, i) => pTxn({ transaction_id: `a-${i}` })),
        ...Array.from({ length: half }, (_, i) => pTxn({ transaction_id: `b-${i}`, account_id: "plaid-acct-2" })),
      ];
      const out = await runSync(deps({ store, normalizeCtx: ctx2, transactionsSync: async () => page({ added }) }));

      expect(out.applied.inserts).toBe(half * 2);
      // Neither account alone reaches the threshold — combining them would be
      // the exact cross-account bug this design forbids.
      expect(calls.flags).toEqual([]);
    });

    it("flagging never changes a transaction's financial semantics (direction/amount/category unaffected)", async () => {
      const { store, calls } = fakeStore();
      const added = Array.from({ length: ANOMALY_REVIEW_THRESHOLD }, (_, i) =>
        pTxn({ transaction_id: `sem-${i}`, amount: 33.5 }),
      );
      await runSync(deps({ store, transactionsSync: async () => page({ added }) }));

      expect(calls.flags).toHaveLength(1); // confirms the anomaly path really ran
      const inserted = calls.plans[0].plan.inserts;
      expect(inserted).toHaveLength(ANOMALY_REVIEW_THRESHOLD);
      for (const txn of inserted) {
        expect(txn.direction).toBe("debit");
        expect(txn.amount).toBe(3350);
        expect(txn.categoryId).toBe("cat-food");
        expect(txn.isTransfer).toBe(false);
      }
    });
  });

  it("finalizes an account's sign convention once enough consistent evidence has accumulated", async () => {
    const evidence = Array.from({ length: MIN_EVIDENCE_SAMPLES }, () => ({ rawAmount: -100, primary: "FOOD_AND_DRINK" }));
    const unknownMap = new Map(accountMap);
    unknownMap.set(ACCT, { ...unknownMap.get(ACCT)!, signConvention: "unknown" });
    const { store, calls } = fakeStore([], {}, { "pa-1": evidence });

    await runSync({
      userId: "u1",
      itemId: "item1",
      initialCursor: null,
      transactionsSync: async () => page({ added: [pTxn()], next_cursor: "c2" }),
      store,
      normalizeCtx: { ...normalizeCtx, accountMap: unknownMap },
    });

    expect(calls.finalizedSignConventions).toEqual([{ plaidAccountRowId: "pa-1", convention: "inverted" }]);
  });

  it("flags an account for review once ambiguous evidence exceeds the sample threshold, without finalizing it", async () => {
    const evidence = [
      ...Array.from({ length: 16 }, () => ({ rawAmount: 100, primary: "FOOD_AND_DRINK" })),
      ...Array.from({ length: 15 }, () => ({ rawAmount: -100, primary: "FOOD_AND_DRINK" })),
    ]; // 31 samples, ~52% inverted — ambiguous, past AMBIGUOUS_REVIEW_SAMPLE_THRESHOLD
    const unknownMap = new Map(accountMap);
    unknownMap.set(ACCT, { ...unknownMap.get(ACCT)!, signConvention: "unknown" });
    const { store, calls } = fakeStore([], {}, { "pa-1": evidence });

    await runSync({
      userId: "u1",
      itemId: "item1",
      initialCursor: null,
      transactionsSync: async () => page({ added: [pTxn()], next_cursor: "c2" }),
      store,
      normalizeCtx: { ...normalizeCtx, accountMap: unknownMap },
    });

    expect(calls.finalizedSignConventions).toEqual([]);
    expect(calls.flags).toHaveLength(1);
    expect(calls.flags[0].accountId).toBe("b-acct-1");
    expect(calls.flags[0].reason).toMatch(/sign convention/i);
  });

  it("does not check sign-convention evidence for an account that already has a resolved convention", async () => {
    // accountMap fixture already has signConvention: "standard" for ACCT
    const { store, calls } = fakeStore([], {}, { "pa-1": [{ rawAmount: -999999, primary: "FOOD_AND_DRINK" }] });

    await runSync({
      userId: "u1",
      itemId: "item1",
      initialCursor: null,
      transactionsSync: async () => page({ added: [pTxn()], next_cursor: "c2" }),
      store,
      normalizeCtx,
    });

    expect(calls.finalizedSignConventions).toEqual([]);
    expect(calls.flags).toEqual([]);
  });

  it("does nothing yet when an unknown account has insufficient evidence (below both sample thresholds)", async () => {
    // Below MIN_EVIDENCE_SAMPLES too, so detectSignConvention hits its early
    // "unknown" return, not just the ambiguous-vote-fraction branch.
    const evidence = Array.from({ length: MIN_EVIDENCE_SAMPLES - 1 }, () => ({
      rawAmount: -100,
      primary: "FOOD_AND_DRINK",
    }));
    expect(evidence.length).toBeLessThan(AMBIGUOUS_REVIEW_SAMPLE_THRESHOLD);
    const unknownMap = new Map(accountMap);
    unknownMap.set(ACCT, { ...unknownMap.get(ACCT)!, signConvention: "unknown" });
    const { store, calls } = fakeStore([], {}, { "pa-1": evidence });

    await runSync({
      userId: "u1",
      itemId: "item1",
      initialCursor: null,
      transactionsSync: async () => page({ added: [pTxn()], next_cursor: "c2" }),
      store,
      normalizeCtx: { ...normalizeCtx, accountMap: unknownMap },
    });

    expect(calls.finalizedSignConventions).toEqual([]);
    expect(calls.flags).toEqual([]);
  });
});
