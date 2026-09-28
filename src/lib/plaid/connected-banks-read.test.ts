import { describe, expect, it } from "vitest";
import { loadConnectedBanks } from "./connected-banks-read";

type Answer = { data: unknown; error?: { message: string } | null; count?: number | null };

function fakeSupabase(tables: Record<string, Answer>) {
  const calls: Record<string, unknown[][]> = {};
  const supabase = {
    from: (t: string) => {
      const c: unknown[][] = [];
      calls[t] = c;
      const q: unknown = new Proxy(
        {},
        {
          get: (_target, prop) => {
            if (prop === "then") {
              const a = tables[t];
              return (resolve: (v: unknown) => unknown) =>
                Promise.resolve({ data: a?.data ?? null, error: a?.error ?? null, count: a?.count ?? null }).then(resolve);
            }
            return (...args: unknown[]) => {
              c.push([String(prop), ...args]);
              return q;
            };
          },
        },
      );
      return q;
    },
  };
  return { supabase: supabase as never, calls };
}

const accountRow = (over: Record<string, unknown> = {}) => ({
  id: "pa-row-1",
  plaid_item_id: "item-1",
  plaid_account_id: "pa1",
  name: "Checking",
  official_name: null,
  mask: "1234",
  type: "depository",
  subtype: "checking",
  current_balance: 5000,
  iso_currency_code: "USD",
  link_state: "mapped",
  account_id: "acct-1",
  needs_review: false,
  review_reason: null,
  excluded_from_calculations: false,
  ...over,
});

describe("loadConnectedBanks", () => {
  it("groups accounts under their Item, in Item order, and looks up mapped-account names", async () => {
    const { supabase, calls } = fakeSupabase({
      plaid_items: {
        data: [
          { id: "item-1", item_id: "plaid-item-1", institution_name: "SoFi", status: "active", last_synced_at: "2026-09-20T00:00:00Z" },
          { id: "item-2", item_id: "plaid-item-2", institution_name: "Chase", status: "login_required", last_synced_at: null },
        ],
      },
      plaid_accounts: { data: [accountRow(), accountRow({ id: "pa-row-2", plaid_item_id: "item-2", plaid_account_id: "pa2", account_id: null, link_state: "ignored" })] },
      accounts: { data: [{ id: "acct-1", name: "Everyday Checking" }] },
      transactions: { data: [], count: 0 },
    });

    const data = await loadConnectedBanks(supabase);

    expect(calls.plaid_items).toContainEqual(["order", "created_at", { ascending: true }]);
    expect(data?.budgtsAccounts).toEqual([{ id: "acct-1", name: "Everyday Checking" }]);
    expect(data?.banks.map((b) => [b.itemId, b.status])).toEqual([
      ["plaid-item-1", "active"],
      ["plaid-item-2", "login_required"], // a bank needing attention is listed, never hidden
    ]);
    expect(data?.banks[0]).toEqual({
      id: "item-1",
      itemId: "plaid-item-1",
      institutionName: "SoFi",
      status: "active",
      lastSyncedAt: "2026-09-20T00:00:00Z",
      accounts: [
        {
          rowId: "pa-row-1",
          plaidAccountId: "pa1",
          name: "Checking",
          officialName: null,
          mask: "1234",
          type: "depository",
          subtype: "checking",
          linkState: "mapped",
          mappedAccountName: "Everyday Checking",
          needsReview: false,
          reviewReason: null,
          excludedFromCalculations: false,
          pendingSignCheckCount: 0,
        },
      ],
      unmappedAccounts: [],
    });
    expect(data?.banks[1]!.accounts[0]).toMatchObject({ linkState: "ignored", mappedAccountName: null });
  });

  it("surfaces unmapped accounts separately and counts pending sign-check rows per account", async () => {
    const { supabase, calls } = fakeSupabase({
      plaid_items: { data: [{ id: "item-1", item_id: "plaid-item-1", institution_name: null, status: "active", last_synced_at: null }] },
      plaid_accounts: { data: [accountRow({ name: "New account", mask: "9999", current_balance: 0, link_state: "unmapped", account_id: null })] },
      accounts: { data: [] },
      transactions: { data: [{ plaid_account_id: "pa-row-1" }, { plaid_account_id: "pa-row-1" }], count: 2 },
    });

    const data = await loadConnectedBanks(supabase);
    expect(data?.banks[0]!.unmappedAccounts).toEqual([
      {
        plaidAccountId: "pa1",
        name: "New account",
        officialName: null,
        mask: "9999",
        type: "depository",
        subtype: "checking",
        currentBalance: 0,
        isoCurrencyCode: "USD",
      },
    ]);
    expect(data?.banks[0]!.accounts[0]!.pendingSignCheckCount).toBe(2);
    // only rows held for the sign-convention check are counted
    expect(calls.transactions).toEqual(
      expect.arrayContaining([
        ["eq", "status", "pending_review"],
        ["eq", "pending_reason", "sign_convention_unknown"],
      ]),
    );
  });

  it("returns null (not an empty list that looks final) when the Plaid tables aren't present on this deployment", async () => {
    const { supabase } = fakeSupabase({ plaid_items: { data: null, error: { message: "relation does not exist" } } });
    expect(await loadConnectedBanks(supabase)).toBeNull();
  });

  it("lists no banks for a user who has none, with their accounts still available for mapping", async () => {
    const { supabase } = fakeSupabase({
      plaid_items: { data: [] },
      plaid_accounts: { data: [] },
      accounts: { data: [{ id: "acct-1", name: "Wallet" }] },
      transactions: { data: [], count: 0 },
    });
    expect(await loadConnectedBanks(supabase)).toEqual({ banks: [], budgtsAccounts: [{ id: "acct-1", name: "Wallet" }] });
  });
});
