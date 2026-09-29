import { describe, expect, it } from "vitest";
import { accountWritesLocked } from "@/lib/account/write-lock";
import { fakeSupabase, has } from "../../../tests/unit/helpers/fake-supabase";
import { loadMobileActivityExtras, loadMobileStatus } from "./status";

type Rpc = { data: unknown; error: unknown };

function db(opts: { rpc?: Rpc; flagged?: unknown[]; needsRows?: unknown[] } = {}) {
  const fake = fakeSupabase((table, calls) => {
    if (table === "profiles") return { data: { created_at: "2026-09-01T00:00:00Z" } };
    if (table === "transactions") return has(calls, "limit") ? { data: opts.needsRows ?? [] } : { count: 3 };
    if (table === "plaid_accounts") return { data: opts.flagged ?? [] };
    if (table === "categories") return { data: [{ id: "c1", name: "Food / Groceries", kind: "expense", color: "#000" }] };
    if (table === "plaid_items") return { data: [] };
    return { data: [] };
  });
  const supabase = Object.assign(fake.supabase as object, {
    rpc: async () => opts.rpc ?? { data: true, error: null },
  });
  return { supabase: supabase as never, log: fake.log };
}

describe("accountWritesLocked", () => {
  it("is true only when the guard positively refuses writes", async () => {
    expect(await accountWritesLocked(db({ rpc: { data: false, error: null } }).supabase)).toBe(true);
    expect(await accountWritesLocked(db({ rpc: { data: true, error: null } }).supabase)).toBe(false);
    expect(await accountWritesLocked(db({ rpc: { data: null, error: { message: "x" } } }).supabase)).toBe(false);
  });
});

describe("loadMobileStatus", () => {
  it("carries the bell count, the review warnings and the deletion lock", async () => {
    const status = await loadMobileStatus(
      db({
        rpc: { data: false, error: null },
        flagged: [{ name: "Advancial Checking", needs_review: true, excluded_from_calculations: true }],
      }).supabase,
      "u",
      true,
    );
    expect(status.needsCategoryCount).toBe(3);
    expect(status.deletionInProgress).toBe(true);
    expect(status.review.advisory).toBeNull();
    expect(status.review.excluded).toMatch(/^Advancial Checking is excluded from your financial totals/);
  });

  it("with bank connections off: no bell, no warnings, no Plaid tables read", async () => {
    const { supabase, log } = db();
    expect(await loadMobileStatus(supabase, "u", false)).toEqual({
      version: 1,
      needsCategoryCount: null,
      review: { advisory: null, excluded: null },
      deletionInProgress: false,
    });
    expect(log.map((l) => l.table)).toEqual([]);
  });
});

describe("loadMobileActivityExtras", () => {
  it("groups the needs-category rows by merchant and lists missing standard categories", async () => {
    const row = (id: string, at: string) => ({
      id,
      description: "COFFEE",
      merchant_name: "Blue Bottle",
      merchant_entity_id: "m-1",
      amount: 450,
      direction: "debit",
      occurred_at: at,
      pending: false,
      plaid_category_primary: null,
      plaid_category_detailed: null,
      account: { name: "Checking" },
    });
    const extras = await loadMobileActivityExtras(
      db({ needsRows: [row("t1", "2026-09-10T00:00:00Z"), row("t2", "2026-09-12T00:00:00Z")] }).supabase,
      "u",
      true,
    );
    expect(extras.needsCategory).toHaveLength(1);
    expect(extras.needsCategory[0]).toMatchObject({ label: "Blue Bottle", count: 2, anchorId: "t2", netAmount: 900 });
    expect(extras.missingStandardCategories).not.toContain("Food / Groceries");
    expect(extras.limitedHistory).toEqual([]);
  });

  it("is empty with bank connections off", async () => {
    const { supabase, log } = db();
    expect(await loadMobileActivityExtras(supabase, "u", false)).toEqual({
      version: 1,
      plaidEnabled: false,
      needsCategory: [],
      missingStandardCategories: [],
      limitedHistory: [],
    });
    expect(log).toHaveLength(0);
  });
});
