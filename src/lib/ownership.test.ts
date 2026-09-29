import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, has, type FakeCall, type FakeResult } from "../../tests/unit/helpers/fake-supabase";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: () => ({ __db: true }) }));
vi.mock("@/server/plaid/service", () => ({ syncRunner: vi.fn(), drainItemInBackground: vi.fn() }));
const landTransaction = vi.fn();
vi.mock("@/lib/ingestion", async (orig) => ({
  ...(await orig<typeof import("@/lib/ingestion")>()),
  landTransaction: (...a: unknown[]) => landTransaction(...a),
}));
const updateTransactionRow = vi.fn();
vi.mock("@/server/transaction-update", () => ({ updateTransactionRow: (...a: unknown[]) => updateTransactionRow(...a) }));

import { missingOrLocked, referencesVisible } from "./ownership";
import { createManualTransaction, deleteTransactionById, updateManualTransaction } from "@/lib/transactions/commands";
import { setBudget } from "@/lib/budgets/commands";
import { addContribution, setGoalArchived, updateGoal } from "@/lib/goals/commands";
import { setCategoryArchived, updateCategory } from "@/lib/categories/commands";
import { setAccountArchived, updateAccount } from "@/lib/accounts/commands";
import { categorizeBankTransactionFor, mapAccountsFor } from "@/server/plaid/commands";
import { mobileCommandError } from "@/lib/mobile/route";

const MINE = "11111111-1111-4111-8111-111111111111";
const THEIRS = "99999999-9999-4999-8999-999999999999";
const ROW = "22222222-2222-4222-8222-222222222222";

/**
 * A caller who can see only MINE (in every referenced table): RLS makes THEIRS invisible, exactly like an unknown id.
 * `locked` makes `account_accepts_writes()` say no, and every update / delete match zero rows, as the write guard does.
 */
function caller(opts: { locked?: boolean } = {}) {
  return fakeSupabase(
    (_table: string, calls: FakeCall[]): FakeResult => {
      if (has(calls, "in")) {
        const ids = (calls.find((c) => c[0] === "in")![2] as string[]) ?? [];
        return { data: ids.filter((id) => id === MINE).map((id) => ({ id })) };
      }
      if (has(calls, "update") || has(calls, "delete")) return { data: opts.locked ? [] : [{ id: ROW }] };
      if (has(calls, "maybeSingle")) return { data: { item_id: "item-1", merchant_entity_id: null } };
      return { data: [] };
    },
    () => ({ data: !opts.locked }),
  );
}

const writes = (log: { calls: FakeCall[] }[]) =>
  log.filter((l) => l.calls.some((c) => ["insert", "update", "upsert", "delete"].includes(String(c[0]))));

describe("referencesVisible", () => {
  it("passes the caller's own ids and null references; refuses a foreign or unknown id", async () => {
    expect(await referencesVisible(caller().supabase, "accounts", [MINE, null, undefined, MINE])).toEqual({ ok: true });
    expect(await referencesVisible(caller().supabase, "categories", [MINE, THEIRS])).toEqual({ ok: false, error: "missing" });
    expect(await referencesVisible(caller().supabase, "categories", [])).toEqual({ ok: true });
  });

  it("reads through the caller's client once, deduplicated and bounded", async () => {
    const { supabase, log } = caller();
    await referencesVisible(supabase, "savings_goals", [MINE, MINE]);
    expect(log).toHaveLength(1);
    expect(log[0]!.table).toBe("savings_goals");
    expect(log[0]!.calls).toContainEqual(["in", "id", [MINE]]);
    expect(log[0]!.calls).toContainEqual(["limit", 1]);
  });

  it("reports a failed read as failed, never as visible", async () => {
    const { supabase } = fakeSupabase(() => ({ error: { message: "boom" } }));
    expect(await referencesVisible(supabase, "accounts", [MINE])).toEqual({ ok: false, error: "failed", message: "boom" });
  });
});

describe("missingOrLocked", () => {
  it("says locked while a deletion holds the lock, missing otherwise", async () => {
    expect(await missingOrLocked(caller({ locked: true }).supabase)).toEqual({ ok: false, error: "locked" });
    expect(await missingOrLocked(caller().supabase)).toEqual({ ok: false, error: "missing" });
  });
});

describe("every command refuses another user's id and writes nothing", () => {
  const txn = (over: Record<string, unknown>) => ({
    accountId: MINE,
    categoryId: MINE,
    amount: "5",
    direction: "debit",
    occurredAt: "2026-09-10",
    description: "x",
    note: "",
    isTransfer: false,
    ...over,
  });

  it("manual transaction create: a foreign account or category", async () => {
    for (const bad of [{ accountId: THEIRS }, { categoryId: THEIRS }]) {
      const { supabase } = caller();
      expect(await createManualTransaction(supabase, "u", txn(bad))).toEqual({ ok: false, error: "missing_reference" });
    }
    expect(landTransaction).not.toHaveBeenCalled();
  });

  it("manual transaction update: a foreign account or category", async () => {
    for (const bad of [{ accountId: THEIRS }, { categoryId: THEIRS }]) {
      expect(await updateManualTransaction(caller().supabase, ROW, txn(bad))).toEqual({ ok: false, error: "missing_reference" });
    }
    expect(updateTransactionRow).not.toHaveBeenCalled();
  });

  it("setBudget: a foreign category", async () => {
    const { supabase, log } = caller();
    expect(await setBudget(supabase, "u", { categoryId: THEIRS, month: "2026-09", amount: "400" })).toEqual({
      ok: false,
      error: "missing_reference",
    });
    expect(writes(log)).toEqual([]);
  });

  it("addContribution: a foreign goal", async () => {
    const { supabase, log } = caller();
    expect(await addContribution(supabase, "u", { goalId: THEIRS, amount: "5", occurredAt: "2026-09-10", note: "" }, 1)).toEqual({
      ok: false,
      error: "missing",
    });
    expect(writes(log)).toEqual([]);
  });

  it("categorizeBankTransactionFor: a foreign category (never written to the row, the merchant rule or the backfill)", async () => {
    const { supabase, log } = caller();
    expect(await categorizeBankTransactionFor(supabase, "u", { transactionId: ROW, categoryId: THEIRS })).toMatchObject({
      ok: false,
      error: "not_found",
    });
    expect(writes(log)).toEqual([]);
  });

  it("mapAccountsFor: a foreign existing account, checked before any entry is written", async () => {
    const { supabase, log } = caller();
    const r = await mapAccountsFor(supabase, "u", ROW, [
      { plaidAccountId: "pa-1", mode: "new", name: "Checking", type: "checking" },
      { plaidAccountId: "pa-2", mode: "existing", existingAccountId: THEIRS },
    ]);
    expect(r).toMatchObject({ ok: false, error: "not_found" });
    expect(writes(log)).toEqual([]);
  });

  it("the native routes answer these with the usual 404", async () => {
    expect(mobileCommandError({ ok: false, error: "missing_reference" }).status).toBe(404);
    expect(await mobileCommandError({ ok: false, error: "missing_reference" }).json()).toEqual({ error: "not_found" });
  });
});

describe("while an account deletion holds the lock, edits say so instead of 'no longer exists'", () => {
  it("goals, categories, accounts and transactions answer locked", async () => {
    const { supabase } = caller({ locked: true });
    expect(await updateGoal(supabase, ROW, { name: "x", targetAmount: "5", targetDate: "" })).toEqual({ ok: false, error: "locked" });
    expect(await setGoalArchived(supabase, ROW, true)).toEqual({ ok: false, error: "locked" });
    expect(await updateCategory(supabase, ROW, { name: "x", kind: "expense" })).toEqual({ ok: false, error: "locked" });
    expect(await setCategoryArchived(supabase, ROW, true)).toEqual({ ok: false, error: "locked" });
    expect(await updateAccount(supabase, ROW, { name: "x", type: "cash" })).toEqual({ ok: false, error: "locked" });
    expect(await setAccountArchived(supabase, ROW, true)).toEqual({ ok: false, error: "locked" });
    expect(await deleteTransactionById(supabase, ROW)).toEqual({ ok: false, error: "locked" });
    updateTransactionRow.mockResolvedValueOnce({ outcome: "missing" });
    expect(await updateManualTransaction(supabase, ROW, txn({}))).toEqual({ ok: false, error: "locked" });
  });

  it("the native routes answer 423 account_locked", async () => {
    const res = mobileCommandError({ ok: false, error: "locked" });
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: "account_locked" });
  });

  function txn(over: Record<string, unknown>) {
    return { accountId: MINE, categoryId: null, amount: "5", direction: "debit", occurredAt: "2026-09-10", description: "x", note: "", isTransfer: false, ...over };
  }
});
