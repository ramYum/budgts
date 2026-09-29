import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, has } from "../../../tests/unit/helpers/fake-supabase";
import { loadAccountsOverview } from "./load-accounts-overview";

const ACCOUNTS = [
  { id: "a-cash", name: "Cash", type: "cash", is_archived: false },
  { id: "a-chk", name: "Checking", type: "checking", is_archived: false },
  { id: "a-card", name: "Card", type: "credit", is_archived: false },
  { id: "a-old", name: "Old", type: "savings", is_archived: true },
];
const LINKS = [
  { account_id: "a-chk", mask: "1234", plaid_item: { id: "item-1", institution_name: "First Platypus (Sandbox)", status: "active" } },
  { account_id: "a-card", mask: "9876", plaid_item: { id: "item-2", institution_name: "Tartan", status: "login_required" } },
];
const MONTH_ROWS = [{ account_id: "a-chk" }, { account_id: "a-chk" }, { account_id: "a-cash" }];

afterEach(() => vi.useRealTimers());

function db(over: { accountsError?: boolean } = {}) {
  return fakeSupabase((table) => {
    if (table === "accounts") return over.accountsError ? { error: { message: "x" } } : { data: ACCOUNTS };
    if (table === "plaid_accounts") return { data: LINKS };
    return { data: MONTH_ROWS, count: MONTH_ROWS.length };
  });
}

describe("loadAccountsOverview", () => {
  it("groups by linking bank, then by hand, then archived, with this month's counts in the user's zone", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-30T23:30:00Z"), toFake: ["Date"] });
    const { supabase, log } = db();
    const o = await loadAccountsOverview(supabase, { timeZone: "Asia/Tokyo", plaidEnabled: true });
    expect(o.month).toBe("2026-10");
    expect(o.groups).toEqual([
      {
        key: "item-1",
        title: "Linked · First Platypus",
        status: "connected",
        accounts: [{ id: "a-chk", name: "Checking", type: "checking", is_archived: false, mask: "1234", txnCount: 2 }],
      },
      {
        key: "item-2",
        title: "Linked · Tartan",
        status: "attention",
        accounts: [{ id: "a-card", name: "Card", type: "credit", is_archived: false, mask: "9876", txnCount: 0 }],
      },
      {
        key: "by-hand",
        title: "Added by hand",
        accounts: [{ id: "a-cash", name: "Cash", type: "cash", is_archived: false, mask: null, txnCount: 1 }],
      },
    ]);
    expect(o.archived.map((a) => a.id)).toEqual(["a-old"]);
    const txn = log.find((l) => l.table === "transactions")!.calls;
    expect(has(txn, "gte", "occurred_at", "2026-10-01T00:00:00.000Z")).toBe(true);
    expect(has(txn, "is", "duplicate_of_id", null)).toBe(true);
  });

  it("skips Plaid tables when bank connections are off, and throws on a failed read", async () => {
    const off = db();
    await loadAccountsOverview(off.supabase, { timeZone: "UTC", plaidEnabled: false });
    expect(off.log.map((l) => l.table)).not.toContain("plaid_accounts");
    await expect(loadAccountsOverview(db({ accountsError: true }).supabase, { timeZone: "UTC", plaidEnabled: false })).rejects.toThrow();
  });
});
