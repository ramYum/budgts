import { beforeEach, describe, expect, it, vi } from "vitest";

const findItemByPlaidItemId = vi.fn();
const syncItem = vi.fn();
vi.mock("@/lib/plaid/item-store", () => ({ findItemByPlaidItemId: (...a: unknown[]) => findItemByPlaidItemId(...a) }));
vi.mock("@/server/plaid/service", () => ({ plaidDb: {}, syncItem: (...a: unknown[]) => syncItem(...a) }));

import { mapPlaidAccounts } from "./account-mapping-commands";

const USER = "user-a";
const PLAID_ITEM_ROW_ID = "row-1";
const PLAID_ITEM_ID = "plaid-item-1";

/** A minimal PostgREST-shaped fake for `plaid_items` (read) and `accounts`/`plaid_accounts` (write). */
function fakeSupabase(opts: {
  item?: { item_id: string } | null;
  createAccountError?: boolean;
  linkError?: boolean;
}) {
  const calls: { insertedAccounts: unknown[]; accountLinks: unknown[] } = { insertedAccounts: [], accountLinks: [] };
  const supabase = {
    from: (table: string) => {
      if (table === "plaid_items") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.item ?? null, error: null }) }) }) };
      }
      if (table === "accounts") {
        return {
          insert: (row: unknown) => {
            calls.insertedAccounts.push(row);
            return {
              select: () => ({
                single: async () =>
                  opts.createAccountError ? { data: null, error: { message: "boom" } } : { data: { id: "new-account-1" }, error: null },
              }),
            };
          },
        };
      }
      if (table === "plaid_accounts") {
        return {
          update: (row: unknown) => ({
            eq: () => ({
              eq: async () => {
                calls.accountLinks.push(row);
                return opts.linkError ? { error: { message: "boom" } } : { error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { supabase: supabase as never, calls };
}

beforeEach(() => {
  findItemByPlaidItemId.mockReset();
  syncItem.mockReset();
  findItemByPlaidItemId.mockResolvedValue({ userId: USER, itemId: PLAID_ITEM_ID });
  syncItem.mockResolvedValue({ ok: true });
});

describe("mapPlaidAccounts", () => {
  it("says item_not_found without writing anything when the item isn't the caller's", async () => {
    const { supabase, calls } = fakeSupabase({ item: null });
    const r = await mapPlaidAccounts(supabase, USER, PLAID_ITEM_ROW_ID, [
      { plaidAccountId: "pa1", mode: "new", name: "Checking", type: "checking" },
    ]);
    expect(r).toEqual({ outcome: "item_not_found" });
    expect(calls.insertedAccounts).toHaveLength(0);
  });

  it("creates a Budgts account for a 'new' entry and links it", async () => {
    const { supabase, calls } = fakeSupabase({ item: { item_id: PLAID_ITEM_ID } });
    const r = await mapPlaidAccounts(supabase, USER, PLAID_ITEM_ROW_ID, [
      { plaidAccountId: "pa1", mode: "new", name: "Checking", type: "checking" },
    ]);
    expect(r).toEqual({ outcome: "ok" });
    expect(calls.insertedAccounts).toEqual([{ user_id: USER, name: "Checking", type: "checking", source: "plaid" }]);
    expect(calls.accountLinks).toEqual([{ account_id: "new-account-1", link_state: "mapped" }]);
  });

  it("points an 'existing' entry at the given account without creating one", async () => {
    const { supabase, calls } = fakeSupabase({ item: { item_id: PLAID_ITEM_ID } });
    const r = await mapPlaidAccounts(supabase, USER, PLAID_ITEM_ROW_ID, [
      { plaidAccountId: "pa1", mode: "existing", existingAccountId: "acct-9" },
    ]);
    expect(r).toEqual({ outcome: "ok" });
    expect(calls.insertedAccounts).toHaveLength(0);
    expect(calls.accountLinks).toEqual([{ account_id: "acct-9", link_state: "mapped" }]);
  });

  it("leaves an 'ignore' entry unmapped", async () => {
    const { supabase, calls } = fakeSupabase({ item: { item_id: PLAID_ITEM_ID } });
    await mapPlaidAccounts(supabase, USER, PLAID_ITEM_ROW_ID, [{ plaidAccountId: "pa1", mode: "ignore" }]);
    expect(calls.accountLinks).toEqual([{ account_id: null, link_state: "ignored" }]);
  });

  it("runs the first sync after mapping, and warns (still ok) rather than failing when it doesn't finish", async () => {
    syncItem.mockResolvedValue({ ok: false });
    const { supabase } = fakeSupabase({ item: { item_id: PLAID_ITEM_ID } });
    const r = await mapPlaidAccounts(supabase, USER, PLAID_ITEM_ROW_ID, [{ plaidAccountId: "pa1", mode: "ignore" }]);
    expect(r).toEqual({ outcome: "ok", warning: "Accounts saved. The first sync didn't finish — it'll retry shortly." });
    expect(syncItem).toHaveBeenCalledWith({ userId: USER, itemId: PLAID_ITEM_ID });
  });

  it("reports a database failure creating the account without leaving a partial mapping silently unmapped", async () => {
    const { supabase } = fakeSupabase({ item: { item_id: PLAID_ITEM_ID }, createAccountError: true });
    const r = await mapPlaidAccounts(supabase, USER, PLAID_ITEM_ROW_ID, [
      { plaidAccountId: "pa1", mode: "new", name: "Checking", type: "checking" },
    ]);
    expect(r).toEqual({ outcome: "failed", message: "Could not create the account. Try again." });
  });

  it("reports a database failure saving the link", async () => {
    const { supabase } = fakeSupabase({ item: { item_id: PLAID_ITEM_ID }, linkError: true });
    const r = await mapPlaidAccounts(supabase, USER, PLAID_ITEM_ROW_ID, [{ plaidAccountId: "pa1", mode: "ignore" }]);
    expect(r).toEqual({ outcome: "failed", message: "Could not save the account mapping. Try again." });
  });
});
