import { describe, expect, it } from "vitest";
import { accountAcceptsEntries, selectableAccounts } from "./selectable-accounts";

describe("accountAcceptsEntries", () => {
  type Row = { id: string; name: string; source: "manual" | "plaid"; is_archived: boolean } | null;
  /** A caller-scoped client stand-in: `account` is what RLS lets the caller see, `linkedIds` the live bank links. */
  function client(account: Row, linkedIds: string[] = []) {
    return {
      from(table: string) {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: (_col: string, id: string) => ({
                maybeSingle: async () => ({ data: account && account.id === id ? account : null, error: null }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              limit: async () => ({ data: linkedIds.includes(id) ? [{ id: "pa" }] : [], error: null }),
            }),
          }),
        };
      },
    } as never;
  }

  it("accepts an active manual account", async () => {
    expect(await accountAcceptsEntries(client({ id: "a", name: "Cash", source: "manual", is_archived: false }), "a")).toBe(true);
  });

  it("accepts a bank account while its connection is live", async () => {
    expect(await accountAcceptsEntries(client({ id: "a", name: "Chase", source: "plaid", is_archived: false }, ["a"]), "a")).toBe(true);
  });

  it("refuses a disconnected bank's account", async () => {
    expect(await accountAcceptsEntries(client({ id: "a", name: "Chase", source: "plaid", is_archived: false }), "a")).toBe(false);
  });

  it("refuses an archived account", async () => {
    expect(await accountAcceptsEntries(client({ id: "a", name: "Cash", source: "manual", is_archived: true }), "a")).toBe(false);
  });

  it("refuses an account the caller can't see (another user's, under RLS) or that doesn't exist", async () => {
    expect(await accountAcceptsEntries(client(null), "someone-elses")).toBe(false);
  });
});

describe("selectableAccounts", () => {
  it("keeps a manual account regardless of the live-linked set", () => {
    const result = selectableAccounts([{ id: "a1", name: "Cash", source: "manual" }], new Set());
    expect(result).toEqual([{ id: "a1", name: "Cash" }]);
  });

  it("keeps a plaid account that is currently live-linked", () => {
    const result = selectableAccounts(
      [{ id: "a1", name: "Chase Checking", source: "plaid" }],
      new Set(["a1"]),
    );
    expect(result).toEqual([{ id: "a1", name: "Chase Checking" }]);
  });

  it("drops a plaid account that is no longer live-linked (disconnected)", () => {
    const result = selectableAccounts(
      [{ id: "a1", name: "Chase Checking", source: "plaid" }],
      new Set(),
    );
    expect(result).toEqual([]);
  });

  it("drops an orphaned duplicate from a reconnect, keeping only the live one", () => {
    const result = selectableAccounts(
      [
        { id: "old", name: "Chase Checking", source: "plaid" },
        { id: "new", name: "Chase Checking", source: "plaid" },
      ],
      new Set(["new"]),
    );
    expect(result).toEqual([{ id: "new", name: "Chase Checking" }]);
  });

  it("mixes manual and live-linked plaid accounts, dropping only disconnected ones", () => {
    const result = selectableAccounts(
      [
        { id: "cash", name: "Cash", source: "manual" },
        { id: "live", name: "SoFi", source: "plaid" },
        { id: "gone", name: "Old Advancial", source: "plaid" },
      ],
      new Set(["live"]),
    );
    expect(result).toEqual([
      { id: "cash", name: "Cash" },
      { id: "live", name: "SoFi" },
    ]);
  });

  it("returns an empty list for an empty input", () => {
    expect(selectableAccounts([], new Set())).toEqual([]);
  });
});
