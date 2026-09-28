import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDashboard } from "@/lib/budget/dashboard";
import { loadHome } from "./load-home";

type Result = { data?: unknown; error?: { message: string } | null; count?: number | null };

/** A PostgREST stand-in: every `from(table)` chain records its calls and resolves to what `answer` says. */
function fakeSupabase(answer: (table: string, calls: unknown[][]) => Result) {
  const log: { table: string; calls: unknown[][] }[] = [];
  const supabase = {
    from: (table: string) => {
      const calls: unknown[][] = [];
      log.push({ table, calls });
      const q: unknown = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === "then") {
              const r = answer(table, calls);
              return (resolve: (v: unknown) => unknown) =>
                Promise.resolve({ data: r.data ?? null, error: r.error ?? null, count: r.count ?? null }).then(resolve);
            }
            return (...args: unknown[]) => {
              calls.push([String(prop), ...args]);
              return q;
            };
          },
        },
      );
      return q;
    },
  };
  return { supabase: supabase as never, log };
}

const CATS = [
  { id: "food", kind: "expense", name: "Food", color: "#0a0" },
  { id: "pay", kind: "income", name: "Pay", color: "#00a" },
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
  row({ amount: 4500 }),
  row({ amount: 700, occurred_at: "2026-08-20T12:00:00+00:00" }), // last month
  row({ amount: 9999, plaid_account_id: "pa-excluded" }), // an owner-excluded bank account never counts
];

function standard(overrides: Record<string, Result> = {}) {
  return (table: string, calls: unknown[][]): Result => {
    if (overrides[table]) return overrides[table]!;
    switch (table) {
      case "transactions":
        return calls.some((c) => c[0] === "limit") ? { data: [] } : { data: TXNS, count: TXNS.length };
      case "categories":
        return { data: CATS };
      case "budgets":
        return { data: [{ category_id: "food", amount: 20000 }] };
      case "profiles":
        return { data: { currency: "EUR" } };
      case "accounts":
        return { data: [{ id: "a1", name: "Wallet", source: "manual" }] };
      case "plaid_accounts":
        return calls.some((c) => c[0] === "eq" && c[1] === "excluded_from_calculations")
          ? { data: [{ id: "pa-excluded" }] }
          : { data: [] };
      case "plaid_items":
        return { count: 2 };
      default:
        return { data: [] };
    }
  };
}

afterEach(() => vi.useRealTimers());

describe("loadHome", () => {
  it("computes Home with the domain's own dashboard math, for the user's current month in their time zone", async () => {
    // 23:30 UTC on Sep 30 is already Oct 1 in Tokyo: "this month" is October there.
    vi.useFakeTimers({ now: new Date("2026-09-30T23:30:00Z"), toFake: ["Date"] });
    const { supabase } = fakeSupabase(standard());

    const home = await loadHome(supabase, { userId: "u", timeZone: "Asia/Tokyo", plaidEnabled: true });

    expect(home.month).toBe("2026-10");
    expect(home.thisMonth).toBe("2026-10");
    expect(home.defaultDate).toBe("2026-10-01");
  });

  it("returns exactly what buildDashboard gives for the month's rows (a move, not new math)", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-05T12:00:00Z"), toFake: ["Date"] });
    const { supabase } = fakeSupabase(standard());

    const home = await loadHome(supabase, { userId: "u", timeZone: "UTC", month: "2026-09", plaidEnabled: true });

    const expected = buildDashboard(
      [
        { categoryId: "pay", amount: 300000, direction: "credit", occurredAt: new Date("2026-09-10T12:00:00Z"), status: "confirmed", isTransfer: false, duplicateOfId: null, eventRole: null, transferUserSet: false, accountExcluded: false },
        { categoryId: "food", amount: 4500, direction: "debit", occurredAt: new Date("2026-09-10T12:00:00Z"), status: "confirmed", isTransfer: false, duplicateOfId: null, eventRole: null, transferUserSet: false, accountExcluded: false },
        { categoryId: "food", amount: 9999, direction: "debit", occurredAt: new Date("2026-09-10T12:00:00Z"), status: "confirmed", isTransfer: false, duplicateOfId: null, eventRole: null, transferUserSet: false, accountExcluded: true },
      ],
      CATS as never,
      [{ categoryId: "food", amount: 20000 }],
      "2026-09",
    );
    expect(home.view).toEqual(expected);
    expect(home.view.tiles.spent).toBe(4500); // the excluded account's row does not count
    expect(home.prevView.tiles.spent).toBe(700);
    expect(home.currency).toBe("EUR");
    expect(home.bankConnected).toBe(true);
    expect(home.defaultDate).toBe("2026-09-15"); // not the current month: mid-month default
    expect(home.degraded).toEqual([]);
  });

  it("names every side query that failed, so a caller can refuse to show partial numbers", async () => {
    const { supabase } = fakeSupabase(
      standard({ budgets: { error: { message: "x" } }, savings_goals: { error: { message: "y" } } }),
    );
    const home = await loadHome(supabase, { userId: "u", timeZone: "UTC", month: "2026-09", plaidEnabled: true });
    expect(home.degraded.sort()).toEqual(["budgets", "goals"]);
  });

  it("does not touch Plaid tables when Plaid is off", async () => {
    const { supabase, log } = fakeSupabase(standard());
    const home = await loadHome(supabase, { userId: "u", timeZone: "UTC", month: "2026-09", plaidEnabled: false });
    expect(log.map((l) => l.table)).not.toContain("plaid_accounts");
    expect(log.map((l) => l.table)).not.toContain("plaid_items");
    expect(home.bankConnected).toBeNull();
  });
});
