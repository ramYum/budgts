import { describe, expect, it } from "vitest";
import { STANDARD_CATEGORIES } from "@/lib/categories/standard";
import { fakeSupabase, has } from "../../../tests/unit/helpers/fake-supabase";
import { loadNeedsCategory, missingStandardCategories, needsCategoryCount, NEEDS_CATEGORY_LIMIT } from "./needs-category";

const ROW = {
  id: "t1",
  description: "SQ *COFFEE",
  merchant_name: "Blue Bottle",
  merchant_entity_id: "m-1",
  amount: 450,
  direction: "debit",
  occurred_at: "2026-09-10T12:00:00Z",
  pending: false,
  plaid_category_primary: "FOOD_AND_DRINK",
  plaid_category_detailed: "FOOD_AND_DRINK_COFFEE",
  account: { name: "Checking" },
};

describe("loadNeedsCategory", () => {
  it("maps rows with the account name and Plaid's hint resolved against the user's own categories", async () => {
    const { supabase, log } = fakeSupabase(() => ({ data: [ROW, { ...ROW, id: "t2", account: [{ name: "Card" }], plaid_category_primary: null, plaid_category_detailed: null }] }));
    const items = await loadNeedsCategory(supabase, "2026-09-01T00:00:00Z", [{ id: "cat-food", name: "Food / Groceries" }]);
    expect(items[0]).toMatchObject({ id: "t1", account_name: "Checking", merchant_name: "Blue Bottle", pending: false });
    expect(items[1]).toMatchObject({ id: "t2", account_name: "Card", suggested_category_id: null });
    const calls = log[0]!.calls;
    expect(has(calls, "limit", NEEDS_CATEGORY_LIMIT)).toBe(true);
    expect(has(calls, "is", "category_id", null)).toBe(true);
  });

  it("throws on a failed read (never a silently empty to-do list)", async () => {
    const { supabase } = fakeSupabase(() => ({ error: { message: "x" } }));
    await expect(loadNeedsCategory(supabase, "2026-09-01T00:00:00Z", [])).rejects.toThrow();
  });
});

describe("needsCategoryCount / missingStandardCategories", () => {
  it("is a head-only count under the same window", async () => {
    const { supabase, log } = fakeSupabase(() => ({ count: 7 }));
    expect(await needsCategoryCount(supabase, "2026-09-01T00:00:00Z")).toBe(7);
    expect(log[0]!.calls.find((c) => c[0] === "select")![2]).toEqual({ count: "exact", head: true });
  });

  it("offers only the standard categories the user lacks", () => {
    const all = STANDARD_CATEGORIES.map((c) => c.name);
    expect(missingStandardCategories(all)).toEqual([]);
    expect(missingStandardCategories(all.slice(1))).toEqual([all[0]]);
  });
});
