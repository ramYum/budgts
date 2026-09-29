import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDashboard } from "@/lib/budget/dashboard";
import { fakeSupabase, has, type FakeCall, type FakeResult } from "../../../tests/unit/helpers/fake-supabase";
import { loadInsights } from "./load-insights";

const CATS = [
  { id: "food", kind: "expense", name: "Food", color: "#0a0" },
  { id: "pay", kind: "income", name: "Pay", color: "#00a" },
  { id: "side", kind: "income", name: "Side gig", color: "#a00" },
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
const TXNS = [
  row({ category_id: "pay", amount: 300000, direction: "credit" }),
  row({ category_id: "side", amount: 20000, direction: "credit" }),
  row({ amount: 4500 }),
  row({ amount: 700, occurred_at: "2026-08-20T12:00:00+00:00" }),
  row({ amount: 9999, plaid_account_id: "pa-excluded" }),
];

function standard(over: Record<string, FakeResult> = {}) {
  return (table: string, calls: FakeCall[]): FakeResult => {
    if (over[table]) return over[table]!;
    switch (table) {
      case "transactions":
        return { data: TXNS, count: TXNS.length };
      case "categories":
        return { data: CATS };
      case "budgets":
        return { data: [{ category_id: "food", amount: 20000 }] };
      case "profiles":
        return { data: { currency: "EUR" } };
      case "plaid_accounts":
        return has(calls, "eq", "excluded_from_calculations", true) ? { data: [{ id: "pa-excluded" }] } : { data: [] };
      default:
        return { data: [] };
    }
  };
}

afterEach(() => vi.useRealTimers());

describe("loadInsights", () => {
  it("is buildDashboard over the month's and the previous month's rows, with the excluded account left out", async () => {
    const { supabase } = fakeSupabase(standard());
    const data = await loadInsights(supabase, { userId: "u", timeZone: "UTC", month: "2026-09", plaidEnabled: true });
    expect(data.degraded).toEqual([]);
    expect(data.current.tiles.spent).toBe(4500);
    expect(data.current.tiles.income).toBe(320000);
    expect(data.previous.tiles.spent).toBe(700);
    expect(data.current).toEqual(
      buildDashboard(
        [
          { categoryId: "pay", amount: 300000, direction: "credit", occurredAt: new Date("2026-09-10T12:00:00Z"), status: "confirmed", isTransfer: false, duplicateOfId: null, eventRole: null, transferUserSet: false, accountExcluded: false },
          { categoryId: "side", amount: 20000, direction: "credit", occurredAt: new Date("2026-09-10T12:00:00Z"), status: "confirmed", isTransfer: false, duplicateOfId: null, eventRole: null, transferUserSet: false, accountExcluded: false },
          { categoryId: "food", amount: 4500, direction: "debit", occurredAt: new Date("2026-09-10T12:00:00Z"), status: "confirmed", isTransfer: false, duplicateOfId: null, eventRole: null, transferUserSet: false, accountExcluded: false },
          { categoryId: "food", amount: 9999, direction: "debit", occurredAt: new Date("2026-09-10T12:00:00Z"), status: "confirmed", isTransfer: false, duplicateOfId: null, eventRole: null, transferUserSet: false, accountExcluded: true },
        ],
        CATS as never,
        [{ categoryId: "food", amount: 20000 }],
        "2026-09",
      ),
    );
    expect(data.incomeSources).toEqual([
      { name: "Pay", color: "#00a", amount: 300000 },
      { name: "Side gig", color: "#a00", amount: 20000 },
    ]);
    expect(data.trend.map((t) => t.month)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(data.currency).toBe("EUR");
  });

  it("defaults to the user's current month in their own time zone", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-30T23:30:00Z"), toFake: ["Date"] });
    const { supabase } = fakeSupabase(standard());
    const data = await loadInsights(supabase, { userId: "u", timeZone: "Asia/Tokyo", plaidEnabled: true });
    expect(data.month).toBe("2026-10");
  });

  it("names every failed side query, and does not touch Plaid tables when Plaid is off", async () => {
    const failing = fakeSupabase(
      standard({ budgets: { error: { message: "x" } }, plaid_accounts: { error: { message: "y" } } }),
    );
    const data = await loadInsights(failing.supabase, { userId: "u", timeZone: "UTC", month: "2026-09", plaidEnabled: true });
    expect(data.degraded.sort()).toEqual(["budgets", "excludedAccounts"]);

    const off = fakeSupabase(standard());
    await loadInsights(off.supabase, { userId: "u", timeZone: "UTC", month: "2026-09", plaidEnabled: false });
    expect(off.log.map((l) => l.table)).not.toContain("plaid_accounts");
    const txnCalls = off.log.find((l) => l.table === "transactions")!.calls;
    expect(has(txnCalls, "is", "removed_at", null)).toBe(false);
  });

  it("throws when the transactions read fails (never a silently partial month)", async () => {
    const { supabase } = fakeSupabase(standard({ transactions: { error: { message: "boom" } } }));
    await expect(loadInsights(supabase, { userId: "u", timeZone: "UTC", month: "2026-09", plaidEnabled: true })).rejects.toThrow();
  });
});
