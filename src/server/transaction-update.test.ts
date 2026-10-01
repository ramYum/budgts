import { describe, expect, it } from "vitest";
import { readObservedRow, updateTransactionRow, type UpdateTransactionFields } from "./transaction-update";

const ACCOUNT = "33333333-3333-4333-8333-333333333333";

/** A PostgREST-shaped fake: each `from()` chain records its calls and resolves to the next queued answer. */
function fake(answers: { data: unknown; error?: { message: string } | null }[]) {
  const chains: unknown[][][] = [];
  const supabase = {
    from: () => {
      const calls: unknown[][] = [];
      chains.push(calls);
      const q: unknown = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === "then") {
              const a = answers.shift() ?? { data: null };
              return (resolve: (v: unknown) => unknown) => Promise.resolve({ data: a.data, error: a.error ?? null }).then(resolve);
            }
            return (...args: unknown[]) => {
              calls.push([String(prop), ...args]);
              return prop === "maybeSingle" ? Promise.resolve(answers.shift() ?? { data: null, error: null }) : q;
            };
          },
        },
      );
      return q;
    },
  };
  return { supabase: supabase as never, chains };
}

const fields: UpdateTransactionFields = {
  accountId: ACCOUNT,
  categoryId: null,
  amount: 1234,
  direction: "debit",
  occurredAt: "2026-09-10T12:00:00.000Z",
  description: "Coffee",
  note: null,
  isTransfer: false,
};
const observed = { isTransfer: false, accountId: ACCOUNT, bankSourced: false };
const isUpdate = (c: unknown[][]) => c.some((x) => x[0] === "update");

describe("readObservedRow", () => {
  it("reads is_transfer, the account and whether the row came from a bank, in one query", async () => {
    const { supabase, chains } = fake([
      { data: { is_transfer: true, account_id: ACCOUNT, source: "manual", plaid_account_id: null } },
    ]);
    expect(await readObservedRow(supabase, "t")).toEqual({ isTransfer: true, accountId: ACCOUNT, bankSourced: false });
    expect(chains).toHaveLength(1);
  });

  it("treats a bank-sourced row, or any row still linked to a Plaid account, as bank-imported", async () => {
    const bank = fake([{ data: { is_transfer: false, account_id: ACCOUNT, source: "bank", plaid_account_id: null } }]);
    expect((await readObservedRow(bank.supabase, "t"))?.bankSourced).toBe(true);
    const linked = fake([{ data: { is_transfer: false, account_id: ACCOUNT, source: "manual", plaid_account_id: "pa-1" } }]);
    expect((await readObservedRow(linked.supabase, "t"))?.bankSourced).toBe(true);
  });

  it("is null when the row is gone or hidden by RLS", async () => {
    expect(await readObservedRow(fake([{ data: null }]).supabase, "t")).toBeNull();
  });
});

describe("updateTransactionRow with an observed row", () => {
  it("writes without re-reading, conditional on both the observed is_transfer and account", async () => {
    const { supabase, chains } = fake([{ data: [{ id: "t" }] }]);
    expect(await updateTransactionRow(supabase, "t", fields, observed)).toEqual({ outcome: "ok" });
    expect(chains).toHaveLength(1);
    expect(chains[0]).toEqual(
      expect.arrayContaining([
        ["eq", "id", "t"],
        ["eq", "is_transfer", false],
        ["eq", "account_id", ACCOUNT],
      ]),
    );
  });

  it("reports a conflict, without a second write, when the row's account changed after it was read", async () => {
    const { supabase, chains } = fake([
      { data: [] }, // the conditional write matched nothing
      { data: { is_transfer: false, account_id: "someone-moved-it", source: "manual", plaid_account_id: null } },
    ]);
    expect(await updateTransactionRow(supabase, "t", fields, observed)).toEqual({ outcome: "conflict" });
    expect(chains.filter(isUpdate)).toHaveLength(1);
  });

  it("retries once against a fresh is_transfer when only that changed, still conditional on the account", async () => {
    const { supabase, chains } = fake([
      { data: [] },
      { data: { is_transfer: true, account_id: ACCOUNT, source: "manual", plaid_account_id: null } },
      { data: [{ id: "t" }] },
    ]);
    expect(await updateTransactionRow(supabase, "t", fields, observed)).toEqual({ outcome: "ok" });
    const writes = chains.filter(isUpdate);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(expect.arrayContaining([["eq", "is_transfer", true], ["eq", "account_id", ACCOUNT]]));
  });

  it("says missing when the row vanished between the read and the write", async () => {
    const { supabase } = fake([{ data: [] }, { data: null }]);
    expect(await updateTransactionRow(supabase, "t", fields, observed)).toEqual({ outcome: "missing" });
  });
});
