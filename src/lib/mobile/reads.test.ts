import { describe, expect, it } from "vitest";
import { buildDemoDashboard } from "@/test-utils/demo-dashboard";
import {
  buildMobileBudgets,
  decodeCursor,
  encodeCursor,
  loadAccounts,
  loadCategories,
  loadTransactionsPage,
} from "./reads";

const UUID = "44444444-4444-4444-8444-444444444444";

/** A chainable PostgREST-builder stand-in that records every call and resolves to `result` when awaited. */
function builder(result: { data: unknown; error: { message: string } | null }) {
  const calls: unknown[][] = [];
  const q: unknown = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
        return (...args: unknown[]) => {
          calls.push([String(prop), ...args]);
          return q;
        };
      },
    },
  );
  return { q, calls };
}

function fakeSupabase(tables: Record<string, { data: unknown; error?: { message: string } | null }>) {
  const byTable: Record<string, unknown[][]> = {};
  return {
    supabase: {
      from: (t: string) => {
        const { q, calls } = builder({ data: tables[t]?.data ?? null, error: tables[t]?.error ?? null });
        byTable[t] = calls;
        return q;
      },
    } as never,
    calls: byTable,
  };
}

describe("cursor", () => {
  it("round-trips a position", () => {
    const c = { occurredAt: "2026-09-10T12:00:00.000Z", id: UUID };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("rejects garbage and anything that could smuggle a PostgREST filter", () => {
    expect(decodeCursor("not-base64-json")).toBeNull();
    const evil = (occurredAt: string, id: string) => Buffer.from(JSON.stringify({ occurredAt, id })).toString("base64url");
    expect(decodeCursor(evil("2026-09-10T12:00:00Z),user_id.neq.x,and(a.eq.1", UUID))).toBeNull();
    expect(decodeCursor(evil("2026-09-10T12:00:00.000Z", `${UUID}),id.neq.x`))).toBeNull();
    expect(decodeCursor(evil("2026-09-10T12:00:00.000Z", "not-a-uuid"))).toBeNull();
  });
});

describe("buildMobileBudgets", () => {
  it("projects the dashboard's own budget-vs-actual numbers without recomputing anything", () => {
    const dash = buildDemoDashboard(new Date("2026-09-15T12:00:00Z"));
    const b = buildMobileBudgets({
      month: "2026-09",
      dash: { view: dash.view, prevView: dash.prevView, trend: dash.trend, savings: dash.savings, currency: dash.currency, categories: dash.categories, degraded: [] },
    });
    expect(b).toMatchObject({
      version: 1,
      month: "2026-09",
      currency: dash.currency,
      budgeted: dash.view.tiles.budgeted,
      spent: dash.view.tiles.spent,
      leftToSpend: dash.view.tiles.leftToSpend,
    });
    expect(b.categories).toHaveLength(dash.view.bars.length);
    expect(b.categories[0]).toEqual({
      id: dash.view.bars[0].categoryId,
      name: dash.view.bars[0].name,
      color: dash.view.bars[0].color,
      budget: dash.view.bars[0].budget,
      actual: dash.view.bars[0].actual,
      remaining: dash.view.bars[0].remaining,
      pctUsed: dash.view.bars[0].pctUsed,
      state: dash.view.bars[0].state,
    });
  });
});

describe("loadAccounts", () => {
  const accounts = [
    { id: "a1", name: "Wallet", type: "cash", source: "manual", is_archived: false },
    { id: "a2", name: "SoFi", type: "checking", source: "plaid", is_archived: false },
    { id: "a3", name: "Old bank", type: "checking", source: "plaid", is_archived: false },
    { id: "a4", name: "Closed", type: "cash", source: "manual", is_archived: true },
  ];

  it("marks which accounts a manual transaction may be entered against", async () => {
    const { supabase } = fakeSupabase({ accounts: { data: accounts }, plaid_accounts: { data: [{ account_id: "a2" }] } });
    const out = await loadAccounts(supabase, true);
    expect(out.map((a) => [a.id, a.selectable])).toEqual([
      ["a1", true], // manual
      ["a2", true], // plaid with a live link
      ["a3", false], // plaid whose bank was disconnected
      ["a4", false], // archived
    ]);
    expect(out[3].archived).toBe(true);
  });

  it("does not consult Plaid links when Plaid is off", async () => {
    const { supabase, calls } = fakeSupabase({ accounts: { data: accounts } });
    await loadAccounts(supabase, false);
    expect(calls.plaid_accounts).toBeUndefined();
  });

  it("throws rather than serving a partial list", async () => {
    await expect(loadAccounts(fakeSupabase({ accounts: { data: null, error: { message: "x" } } }).supabase, false)).rejects.toThrow();
  });
});

describe("loadCategories", () => {
  it("returns the caller's active categories", async () => {
    const { supabase, calls } = fakeSupabase({ categories: { data: [{ id: "c1", name: "Groceries", kind: "expense", color: "#fff" }] } });
    expect(await loadCategories(supabase)).toEqual([{ id: "c1", name: "Groceries", kind: "expense", color: "#fff" }]);
    expect(calls.categories).toContainEqual(["eq", "is_archived", false]);
  });
});

describe("loadTransactionsPage", () => {
  const rid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  const row = (i: number, over: Record<string, unknown> = {}) => ({
    id: rid(i),
    amount: 1234,
    direction: "debit",
    occurred_at: `2026-09-${String(20 - i).padStart(2, "0")}T12:00:00+00:00`,
    description: `Txn ${i}`,
    note: null,
    is_transfer: false,
    category: { id: UUID, name: "Groceries", color: "#0f0" },
    account: { id: "a1", name: "Wallet", is_archived: false },
    ...over,
  });

  it("applies the same visibility rules as the web ledger", async () => {
    const { supabase, calls } = fakeSupabase({ transactions: { data: [row(1)] } });

    await loadTransactionsPage(supabase, { month: "2026-09", plaidOn: true, limit: 50 });

    const c = calls.transactions;
    expect(c).toContainEqual(["gte", "occurred_at", "2026-09-01T00:00:00.000Z"]);
    expect(c).toContainEqual(["lt", "occurred_at", "2026-10-01T00:00:00.000Z"]);
    expect(c).toContainEqual(["eq", "account.is_archived", false]); // archived accounts stay out of the ledger
    expect(c).toContainEqual(["is", "removed_at", null]); // soft-deleted bank rows
    expect(c).toContainEqual(["is", "duplicate_of_id", null]); // confirmed duplicates
    expect(c).toContainEqual(["or", "source.neq.bank,plaid_account_id.not.is.null"]); // deliberately disconnected banks
    expect(c).toContainEqual(["order", "occurred_at", { ascending: false }]);
    expect(c).toContainEqual(["order", "id", { ascending: false }]);
    expect(c).toContainEqual(["limit", 51]); // one extra row to know whether there is a next page
  });

  it("skips the Plaid-only filters where Plaid is off (their columns may not exist)", async () => {
    const { supabase, calls } = fakeSupabase({ transactions: { data: [] } });
    await loadTransactionsPage(supabase, { month: "2026-09", plaidOn: false, limit: 50 });
    expect(calls.transactions.some((c) => c[1] === "removed_at" || c[1] === "duplicate_of_id")).toBe(false);
  });

  it("filters by category and searches descriptions with LIKE metacharacters escaped", async () => {
    const { supabase, calls } = fakeSupabase({ transactions: { data: [] } });
    await loadTransactionsPage(supabase, { month: "2026-09", plaidOn: false, limit: 50, categoryId: UUID, search: "50%_off\\" });
    expect(calls.transactions).toContainEqual(["eq", "category_id", UUID]);
    expect(calls.transactions).toContainEqual(["ilike", "description", "%50\\%\\_off\\\\%"]);
  });

  it("pages by (occurred_at, id) keyset, and reports the next cursor only when more rows exist", async () => {
    const rows = [row(1), row(2), row(3)];
    const cursor = { occurredAt: "2026-09-19T12:00:00.000Z", id: UUID };
    const { supabase, calls } = fakeSupabase({ transactions: { data: rows } });

    const page = await loadTransactionsPage(supabase, { month: "2026-09", plaidOn: false, limit: 2, cursor });

    expect(calls.transactions).toContainEqual([
      "or",
      `occurred_at.lt.${cursor.occurredAt},and(occurred_at.eq.${cursor.occurredAt},id.lt.${cursor.id})`,
    ]);
    expect(page.items.map((t) => t.id)).toEqual([rid(1), rid(2)]); // the extra row is not returned
    expect(decodeCursor(page.nextCursor!)).toEqual({ occurredAt: "2026-09-18T12:00:00+00:00", id: rid(2) });
  });

  it("has no next cursor on the last page", async () => {
    const { supabase } = fakeSupabase({ transactions: { data: [row(1), row(2)] } });
    expect((await loadTransactionsPage(supabase, { month: "2026-09", plaidOn: false, limit: 5 })).nextCursor).toBeNull();
  });

  it("projects rows into the explicit view-model, flagging uncategorized non-transfers", async () => {
    const { supabase } = fakeSupabase({
      transactions: { data: [row(1), row(2, { category: null }), row(3, { category: null, is_transfer: true })] },
    });
    const { items } = await loadTransactionsPage(supabase, { month: "2026-09", plaidOn: false, limit: 10 });
    expect(items[0]).toEqual({
      id: rid(1),
      amount: 1234,
      direction: "debit",
      occurredAt: "2026-09-19T12:00:00+00:00",
      description: "Txn 1",
      note: null,
      isTransfer: false,
      category: { id: UUID, name: "Groceries", color: "#0f0" },
      account: { id: "a1", name: "Wallet" },
      uncategorized: false,
    });
    expect(items[1].uncategorized).toBe(true);
    expect(items[2].uncategorized).toBe(false); // a transfer needs no category
  });

  it("throws rather than serving a partial list", async () => {
    const { supabase } = fakeSupabase({ transactions: { data: null, error: { message: "x" } } });
    await expect(loadTransactionsPage(supabase, { month: "2026-09", plaidOn: false, limit: 5 })).rejects.toThrow();
  });
});
