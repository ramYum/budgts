import { beforeEach, describe, expect, it, vi } from "vitest";
import { arg, fakeSupabase, has, type FakeCall, type FakeLog, type FakeResult } from "../../../tests/unit/helpers/fake-supabase";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: () => ({ __db: true }) }));
vi.mock("./service", () => ({ syncRunner: vi.fn(), drainItemInBackground: vi.fn() }));
const recategorize = vi.fn();
vi.mock("@/lib/plaid/recategorize", () => ({
  recategorizeUncategorizedBankTxns: (...a: unknown[]) => recategorize(...a),
}));

import { categorizeBankTransactionFor, clearAccountReviewFor, rescanUncategorizedFor } from "./commands";

const TXN = "55555555-5555-4555-8555-555555555555";
const CAT = "66666666-6666-4666-8666-666666666666";
const ROW = "77777777-7777-4777-8777-777777777777";

type Opts = {
  merchant?: string | null;
  txnVisible?: boolean;
  categoryVisible?: boolean;
  existingStd?: { id: string; is_archived: boolean } | null;
};

function db(opts: Opts = {}): { supabase: never; log: FakeLog } {
  return fakeSupabase((table: string, calls: FakeCall[]): FakeResult => {
    if (table === "categories" && has(calls, "insert")) return { data: { id: "std-new" } };
    // The ownership read (src/lib/ownership.ts): the caller sees CAT, never a foreign category.
    if (table === "categories" && has(calls, "in")) return { data: opts.categoryVisible === false ? [] : [{ id: CAT }] };
    if (table === "categories" && has(calls, "maybeSingle")) return { data: opts.existingStd ?? null };
    if (table === "transactions" && has(calls, "maybeSingle")) {
      return { data: opts.txnVisible === false ? null : { merchant_entity_id: opts.merchant ?? null } };
    }
    return { data: [] };
  });
}

beforeEach(() => recategorize.mockReset());

describe("categorizeBankTransactionFor (moved verbatim from the web action)", () => {
  it("sets the category, marks it user-owned, only on a bank row", async () => {
    const { supabase, log } = db();
    expect(await categorizeBankTransactionFor(supabase, "user-a", { transactionId: TXN, categoryId: CAT })).toEqual({ ok: true });
    const update = log.find((l) => l.table === "transactions")!.calls;
    expect(arg(update, "update")).toEqual({ category_id: CAT, user_categorized: true });
    expect(has(update, "eq", "id", TXN)).toBe(true);
    expect(has(update, "eq", "source", "bank")).toBe(true);
    expect(log.some((l) => l.table === "plaid_merchant_rules")).toBe(false);
  });

  it("remembers the merchant and backfills only blank, auto, live, non-transfer rows", async () => {
    const { supabase, log } = db({ merchant: "m-1" });
    await categorizeBankTransactionFor(supabase, "user-a", { transactionId: TXN, categoryId: CAT });
    const rule = log.find((l) => l.table === "plaid_merchant_rules")!.calls;
    expect(arg(rule, "upsert")).toEqual({ user_id: "user-a", merchant_entity_id: "m-1", category_id: CAT });
    const backfill = log.filter((l) => l.table === "transactions")[1]!.calls;
    expect(arg(backfill, "update")).toEqual({ category_id: CAT });
    for (const [col, val] of [
      ["source", "bank"],
      ["merchant_entity_id", "m-1"],
      ["user_categorized", false],
      ["is_transfer", false],
    ] as const) {
      expect(has(backfill, "eq", col, val)).toBe(true);
    }
    expect(has(backfill, "is", "category_id", null)).toBe(true);
    expect(has(backfill, "is", "removed_at", null)).toBe(true);
  });

  it("adds a missing standard category back (restore, or create for the user)", async () => {
    const restore = db({ existingStd: { id: "std-old", is_archived: true } });
    await categorizeBankTransactionFor(restore.supabase, "user-a", { transactionId: TXN, standardCategoryName: "Housing" });
    const restored = restore.log.find((l) => l.table === "categories" && has(l.calls, "update"))!.calls;
    expect(arg(restored, "update")).toEqual({ is_archived: false });
    expect(has(restored, "eq", "id", "std-old")).toBe(true);
    expect(arg(restore.log.find((l) => l.table === "transactions")!.calls, "update")).toEqual({
      category_id: "std-old",
      user_categorized: true,
    });

    const create = db({ existingStd: null });
    await categorizeBankTransactionFor(create.supabase, "user-a", { transactionId: TXN, standardCategoryName: "Housing" });
    const inserted = arg(create.log.find((l) => l.table === "categories" && has(l.calls, "insert"))!.calls, "insert");
    expect(inserted).toMatchObject({ user_id: "user-a", name: "Housing" });
  });

  it("refuses an invalid choice and reports a row it cannot see", async () => {
    const { supabase, log } = db();
    expect(await categorizeBankTransactionFor(supabase, "u", { transactionId: TXN })).toMatchObject({ ok: false, error: "invalid" });
    expect(await categorizeBankTransactionFor(supabase, "u", { transactionId: "x", categoryId: CAT })).toMatchObject({ error: "invalid" });
    expect(
      await categorizeBankTransactionFor(supabase, "u", { transactionId: TXN, categoryId: CAT, standardCategoryName: "Housing" }),
    ).toMatchObject({ error: "invalid" });
    expect(log).toHaveLength(0);
    const hidden = db({ txnVisible: false });
    expect(await categorizeBankTransactionFor(hidden.supabase, "u", { transactionId: TXN, categoryId: CAT })).toMatchObject({
      ok: false,
      error: "not_found",
    });
  });
});

describe("clearAccountReviewFor", () => {
  it("clears the flag on the caller's row, touching no transaction", async () => {
    const { supabase, log } = fakeSupabase(() => ({ data: [{ id: ROW }] }));
    expect(await clearAccountReviewFor(supabase, ROW)).toEqual({ ok: true });
    expect(log.map((l) => l.table)).toEqual(["plaid_accounts"]);
    expect(arg(log[0]!.calls, "update")).toEqual({ needs_review: false, review_reason: null, review_flagged_at: null });
    const gone = fakeSupabase(() => ({ data: [] }));
    expect(await clearAccountReviewFor(gone.supabase, ROW)).toMatchObject({ ok: false, error: "not_found" });
  });
});

describe("rescanUncategorizedFor", () => {
  it("runs the evidence chain for the given (verified) user, and says when nothing changed", async () => {
    recategorize.mockResolvedValue({ updated: 0 });
    expect(await rescanUncategorizedFor("user-a")).toEqual({ ok: true, warning: "Nothing new to categorise." });
    expect(recategorize).toHaveBeenCalledWith({ __db: true }, "user-a");
    recategorize.mockResolvedValue({ updated: 4 });
    expect(await rescanUncategorizedFor("user-a")).toEqual({ ok: true });
  });
});
