import { describe, expect, it } from "vitest";
import { loadConnectedBanksData } from "./connected-banks-read";

function fakeSupabase(tables: Record<string, { data: unknown; error?: { message: string } | null }>) {
  const calls: Record<string, unknown[][]> = {};
  return {
    from: (t: string) => {
      const c: unknown[][] = [];
      calls[t] = c;
      const chain: Record<string, unknown> = {};
      const q = new Proxy(chain, {
        get: (_target, prop) => {
          if (prop === "then") {
            return (resolve: (v: unknown) => unknown) =>
              Promise.resolve({ data: tables[t]?.data ?? null, error: tables[t]?.error ?? null }).then(resolve);
          }
          return (...args: unknown[]) => {
            c.push([String(prop), ...args]);
            return q;
          };
        },
      });
      return q;
    },
  } as never;
}

describe("loadConnectedBanksData", () => {
  it("groups accounts under their item, in item order, and looks up mapped-account names", async () => {
    const supabase = fakeSupabase({
      plaid_items: {
        data: [
          { id: "item-1", item_id: "plaid-item-1", institution_name: "SoFi", status: "active", last_synced_at: "2026-09-20T00:00:00Z" },
        ],
      },
      plaid_accounts: {
        data: [
          {
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
          },
        ],
      },
      accounts: { data: [{ id: "acct-1", name: "Everyday Checking" }] },
      transactions: { data: [] },
    });

    const banks = await loadConnectedBanksData(supabase);

    expect(banks).toEqual([
      {
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
            currentBalance: 5000,
            isoCurrencyCode: "USD",
            linkState: "mapped",
            mappedAccountName: "Everyday Checking",
            needsReview: false,
            reviewReason: null,
            excludedFromCalculations: false,
            pendingSignCheckCount: 0,
          },
        ],
        unmappedAccounts: [],
      },
    ]);
  });

  it("surfaces unmapped accounts separately and counts pending sign-check rows per account", async () => {
    const supabase = fakeSupabase({
      plaid_items: { data: [{ id: "item-1", item_id: "plaid-item-1", institution_name: null, status: "active", last_synced_at: null }] },
      plaid_accounts: {
        data: [
          {
            id: "pa-row-1",
            plaid_item_id: "item-1",
            plaid_account_id: "pa1",
            name: "New account",
            official_name: null,
            mask: "9999",
            type: "depository",
            subtype: "checking",
            current_balance: 0,
            iso_currency_code: "USD",
            link_state: "unmapped",
            account_id: null,
            needs_review: false,
            review_reason: null,
            excluded_from_calculations: false,
          },
        ],
      },
      accounts: { data: [] },
      transactions: { data: [{ plaid_account_id: "pa-row-1" }, { plaid_account_id: "pa-row-1" }] },
    });

    const banks = await loadConnectedBanksData(supabase);
    expect(banks[0].unmappedAccounts).toEqual([
      { plaidAccountId: "pa1", name: "New account", officialName: null, mask: "9999", type: "depository", subtype: "checking", currentBalance: 0, isoCurrencyCode: "USD" },
    ]);
    expect(banks[0].accounts[0].pendingSignCheckCount).toBe(2);
  });

  it("returns an empty list rather than throwing when the Plaid tables aren't present on this deployment", async () => {
    const supabase = fakeSupabase({ plaid_items: { data: null, error: { message: "relation does not exist" } } });
    expect(await loadConnectedBanksData(supabase)).toEqual([]);
  });
});
