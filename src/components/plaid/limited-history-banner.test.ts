import { describe, expect, it } from "vitest";
import { earliestTxnByAccount } from "./limited-history-banner";

type Call = [method: string, ...args: unknown[]];

/** A minimal PostgREST-builder fake: records every chained call per query and
 * resolves a query to the earliest row it was seeded with for the filtered
 * plaid_account_id. */
function fakeSupabase(rowsByAccount: Record<string, string[]>) {
  const queries: Call[][] = [];
  const client = {
    from(table: string) {
      const calls: Call[] = [["from", table]];
      queries.push(calls);
      let accountId: string | null = null;
      const chain = {
        select: (...a: unknown[]) => (calls.push(["select", ...a]), chain),
        eq: (col: string, v: unknown) => {
          calls.push(["eq", col, v]);
          if (col === "plaid_account_id") accountId = v as string;
          return chain;
        },
        is: (...a: unknown[]) => (calls.push(["is", ...a]), chain),
        order: (...a: unknown[]) => (calls.push(["order", ...a]), chain),
        limit: (n: number) => {
          calls.push(["limit", n]);
          const dates = [...(rowsByAccount[accountId ?? ""] ?? [])].sort().slice(0, n);
          return Promise.resolve({ data: dates.map((d) => ({ occurred_at: d })), error: null });
        },
      };
      return chain;
    },
  };
  return { client, queries };
}

describe("earliestTxnByAccount", () => {
  it("returns each account's earliest bank transaction date", async () => {
    const { client } = fakeSupabase({
      a1: ["2026-08-10T00:00:00Z", "2026-06-01T00:00:00Z"],
      a2: ["2026-09-01T00:00:00Z"],
    });
    const out = await earliestTxnByAccount(client as never, ["a1", "a2", "a3"]);
    expect(out.get("a1")).toBe("2026-06-01T00:00:00Z");
    expect(out.get("a2")).toBe("2026-09-01T00:00:00Z");
    expect(out.has("a3")).toBe(false);
  });

  // Regression (perf + correctness, 2026-09-25): the banner used to pull every
  // bank transaction the user ever had, unordered, to find one date per
  // account — silently capped at 1000 rows by PostgREST, so a heavy account
  // could get a wrong "earliest" and the Activity page paid for the whole
  // history on every view. Each lookup must be a bounded, ordered LIMIT 1.
  it("issues one bounded, ascending LIMIT 1 query per account", async () => {
    const { client, queries } = fakeSupabase({ a1: ["2026-06-01T00:00:00Z"] });
    await earliestTxnByAccount(client as never, ["a1", "a2"]);
    expect(queries).toHaveLength(2);
    for (const q of queries) {
      expect(q).toContainEqual(["from", "transactions"]);
      expect(q).toContainEqual(["eq", "source", "bank"]);
      expect(q).toContainEqual(["is", "removed_at", null]);
      expect(q).toContainEqual(["order", "occurred_at", { ascending: true }]);
      expect(q).toContainEqual(["limit", 1]);
    }
  });

  it("makes no queries when there are no accounts", async () => {
    const { client, queries } = fakeSupabase({});
    const out = await earliestTxnByAccount(client as never, []);
    expect(out.size).toBe(0);
    expect(queries).toHaveLength(0);
  });
});
