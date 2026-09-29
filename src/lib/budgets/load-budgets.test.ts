import { describe, expect, it } from "vitest";
import { fakeSupabase, has, type FakeCall, type FakeResult } from "../../../tests/unit/helpers/fake-supabase";
import { loadBudgets } from "./load-budgets";

const CATS = [
  { id: "food", kind: "expense", name: "Food", color: "#0a0" },
  { id: "rent", kind: "expense", name: "Rent", color: "#00a" },
  { id: "pay", kind: "income", name: "Pay", color: "#aaa" },
];
const row = (over: Record<string, unknown>) => ({
  category_id: "food",
  amount: 1000,
  direction: "debit",
  occurred_at: "2026-09-10T12:00:00+00:00",
  status: "confirmed",
  is_transfer: false,
  duplicate_of_id: null,
  event_role: null,
  transfer_user_set: false,
  plaid_account_id: null,
  ...over,
});
const SEP = [row({ amount: 4500 }), row({ category_id: "rent", amount: 100000 }), row({ amount: 9999, plaid_account_id: "pa-x" })];
const AUG = [row({ amount: 700, occurred_at: "2026-08-20T12:00:00+00:00" })];
// A refund in an earlier month nets against that month's spending, and never below zero for the all-time total.
const JUL = [row({ amount: 300, direction: "credit", occurred_at: "2026-07-02T12:00:00+00:00" })];

function db(over: Record<string, FakeResult> = {}) {
  return fakeSupabase((table: string, calls: FakeCall[]): FakeResult => {
    if (over[table]) return over[table]!;
    switch (table) {
      case "transactions": {
        const rows = has(calls, "gte", "occurred_at", "2026-09-01T00:00:00.000Z")
          ? SEP
          : has(calls, "gte", "occurred_at", "2026-08-01T00:00:00.000Z")
            ? AUG
            : [...SEP, ...AUG, ...JUL];
        return { data: rows, count: rows.length };
      }
      case "categories":
        return { data: CATS };
      case "budgets":
        return { data: [{ category_id: "food", amount: 20000 }] };
      case "profiles":
        return { data: { currency: "GBP" } };
      case "plaid_accounts":
        return { data: [{ id: "pa-x" }] };
      default:
        return { data: [] };
    }
  });
}

describe("loadBudgets", () => {
  it("month: budget vs actual with last month beside it, the excluded account left out", async () => {
    const data = await loadBudgets(db().supabase, {
      userId: "u",
      timeZone: "UTC",
      month: "2026-09",
      range: "month",
      plaidEnabled: true,
    });
    if (data.range !== "month") throw new Error("expected the month view");
    expect(data.degraded).toEqual([]);
    expect(data.currency).toBe("GBP");
    expect(data.view.tiles.spent).toBe(104500);
    expect(data.view.tiles.budgeted).toBe(20000);
    expect(data.prevView.tiles.spent).toBe(700);
    // Rent has spending but no budget: it is what "Add a budget" offers.
    expect(data.unbudgeted.map((c) => c.id)).toEqual(["rent"]);
  });

  it("all: each expense category's lifetime spending, largest first", async () => {
    const data = await loadBudgets(db().supabase, { userId: "u", timeZone: "UTC", range: "all", plaidEnabled: true });
    if (data.range !== "all") throw new Error("expected the all-time view");
    expect(data.allTimeRows).toEqual([
      { categoryId: "rent", name: "Rent", color: "#00a", total: 100000 },
      { categoryId: "food", name: "Food", color: "#0a0", total: 4500 + 700 },
    ]);
  });

  it("names failed side queries; a failed transactions read throws", async () => {
    const data = await loadBudgets(db({ budgets: { error: { message: "x" } } }).supabase, {
      userId: "u",
      timeZone: "UTC",
      month: "2026-09",
      range: "month",
      plaidEnabled: true,
    });
    expect(data.degraded).toEqual(["budgets"]);
    await expect(
      loadBudgets(db({ transactions: { error: { message: "x" } } }).supabase, {
        userId: "u",
        timeZone: "UTC",
        month: "2026-09",
        range: "month",
        plaidEnabled: true,
      }),
    ).rejects.toThrow();
  });
});
