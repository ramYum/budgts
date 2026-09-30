import { beforeEach, describe, expect, it, vi } from "vitest";

const landTransaction = vi.fn();
const findExisting = vi.fn();
const updateTransactionRow = vi.fn();
const readObservedRow = vi.fn();
const accountAcceptsEntries = vi.fn();
const store = { findExisting: (...a: unknown[]) => findExisting(...a) };
vi.mock("@/lib/ingestion", async (orig) => ({
  ...(await orig<typeof import("@/lib/ingestion")>()),
  landTransaction: (...a: unknown[]) => landTransaction(...a),
  supabaseTransactionStore: () => store,
}));
vi.mock("@/server/transaction-update", () => ({
  updateTransactionRow: (...a: unknown[]) => updateTransactionRow(...a),
  readObservedRow: (...a: unknown[]) => readObservedRow(...a),
}));
vi.mock("@/lib/accounts/selectable-accounts", () => ({
  accountAcceptsEntries: (...a: unknown[]) => accountAcceptsEntries(...a),
}));

import { createManualTransaction, deleteTransactionById, updateManualTransaction } from "./commands";

const ACCOUNT = "33333333-3333-4333-8333-333333333333";
const CATEGORY = "44444444-4444-4444-8444-444444444444";
const OTHER_ACCOUNT = "55555555-5555-4555-8555-555555555555";
const supabase = { __as: "user-a" } as never;

/** The row as read before an edit: a manual entry on ACCOUNT unless overridden. */
const row = (over: Record<string, unknown> = {}) => ({ isTransfer: false, accountId: ACCOUNT, bankSourced: false, ...over });

const input = (over: Record<string, unknown> = {}) => ({
  accountId: ACCOUNT,
  categoryId: CATEGORY,
  amount: "12.34",
  direction: "debit",
  occurredAt: "2026-09-10",
  description: "Coffee",
  note: "",
  isTransfer: false,
  ...over,
});

beforeEach(() => {
  landTransaction.mockReset();
  findExisting.mockReset();
  updateTransactionRow.mockReset();
  readObservedRow.mockReset();
  accountAcceptsEntries.mockReset();
  landTransaction.mockResolvedValue({ id: "new-id" });
  findExisting.mockResolvedValue(null);
  readObservedRow.mockResolvedValue(row());
  accountAcceptsEntries.mockResolvedValue(true);
});

describe("createManualTransaction", () => {
  it("lands a validated, normalized manual transaction for the given user", async () => {
    const r = await createManualTransaction(supabase, "user-a", input());

    expect(r).toEqual({ ok: true, id: "new-id" });
    const [landedStore, userId, n] = landTransaction.mock.calls[0];
    expect(landedStore).toBe(store);
    expect(userId).toBe("user-a");
    expect(n).toMatchObject({ accountId: ACCOUNT, categoryId: CATEGORY, amount: 1234, direction: "debit", source: "manual", sourceRef: null });
  });

  it("accepts null for 'no category' (JSON callers) as well as an empty string (forms)", async () => {
    await createManualTransaction(supabase, "user-a", input({ categoryId: null }));
    expect(landTransaction.mock.calls[0][2].categoryId).toBeNull();
    await createManualTransaction(supabase, "user-a", input({ categoryId: "" }));
    expect(landTransaction.mock.calls[1][2].categoryId).toBeNull();
  });

  it("makes a retry idempotent by giving the transaction a client-request source reference", async () => {
    await createManualTransaction(supabase, "user-a", input(), "req-1234abcd");
    expect(landTransaction.mock.calls[0][2]).toMatchObject({ source: "manual", sourceRef: "client:req-1234abcd" });
  });

  it("answers a retry of a create that already landed with that row, before any account check", async () => {
    // The first attempt landed; the account may since have stopped taking entries (bank disconnected).
    findExisting.mockResolvedValue({ id: "landed-id" });
    accountAcceptsEntries.mockResolvedValue(false);

    expect(await createManualTransaction(supabase, "user-a", input(), "req-1234abcd")).toEqual({ ok: true, id: "landed-id" });
    expect(findExisting).toHaveBeenCalledWith("user-a", "manual", "client:req-1234abcd");
    expect(accountAcceptsEntries).not.toHaveBeenCalled();
    expect(landTransaction).not.toHaveBeenCalled();
  });

  it("rejects a malformed request id without saving", async () => {
    const r = await createManualTransaction(supabase, "user-a", input(), "bad id!");
    expect(r).toMatchObject({ ok: false, error: "invalid", fieldErrors: { requestId: expect.any(String) } });
    expect(landTransaction).not.toHaveBeenCalled();
  });

  it("returns field errors and saves nothing for invalid input", async () => {
    const r = await createManualTransaction(supabase, "user-a", input({ amount: "abc", accountId: "nope" }));
    expect(r).toMatchObject({ ok: false, error: "invalid" });
    if (!r.ok && r.error === "invalid") expect(Object.keys(r.fieldErrors).sort()).toEqual(["accountId", "amount"]);
    expect(landTransaction).not.toHaveBeenCalled();
  });

  it("refuses an account that can't take entries (archived, disconnected, not the caller's) without saving", async () => {
    accountAcceptsEntries.mockResolvedValue(false);
    const r = await createManualTransaction(supabase, "user-a", input());
    expect(r).toEqual({
      ok: false,
      error: "invalid",
      fieldErrors: { accountId: "That account can't take transactions right now. Keep the current account or choose another." },
    });
    expect(accountAcceptsEntries).toHaveBeenCalledWith(supabase, ACCOUNT);
    expect(landTransaction).not.toHaveBeenCalled();
  });

  it("reports a storage failure with its message", async () => {
    landTransaction.mockRejectedValue(new Error("db down"));
    expect(await createManualTransaction(supabase, "user-a", input())).toEqual({ ok: false, error: "failed", message: "db down" });
  });
});

describe("updateManualTransaction", () => {
  it("writes the validated fields against the row it read, and reports ok", async () => {
    updateTransactionRow.mockResolvedValue({ outcome: "ok" });

    const r = await updateManualTransaction(supabase, "txn-1", input({ isTransfer: true }));

    expect(r).toEqual({ ok: true });
    expect(readObservedRow).toHaveBeenCalledTimes(1);
    // The observed row goes to the write, which is conditional on its account (and is_transfer): one read, atomic keep.
    expect(updateTransactionRow).toHaveBeenCalledWith(
      supabase,
      "txn-1",
      expect.objectContaining({ accountId: ACCOUNT, amount: 1234, isTransfer: true }),
      row(),
    );
  });

  it("keeps the row's own account without re-checking it, even when it can no longer take new entries", async () => {
    // A disconnected bank's account keeps its history; editing that history
    // (a category, a note) must neither move it nor be refused.
    accountAcceptsEntries.mockResolvedValue(false);
    updateTransactionRow.mockResolvedValue({ outcome: "ok" });

    expect(await updateManualTransaction(supabase, "txn-1", input())).toEqual({ ok: true });
    expect(accountAcceptsEntries).not.toHaveBeenCalled();
    expect(updateTransactionRow.mock.calls[0][2].accountId).toBe(ACCOUNT);
  });

  it("moves a manual row to another account only when that account can take entries", async () => {
    updateTransactionRow.mockResolvedValue({ outcome: "ok" });

    expect(await updateManualTransaction(supabase, "txn-1", input({ accountId: OTHER_ACCOUNT }))).toEqual({ ok: true });
    expect(accountAcceptsEntries).toHaveBeenCalledWith(supabase, OTHER_ACCOUNT);
    expect(updateTransactionRow.mock.calls[0][2].accountId).toBe(OTHER_ACCOUNT);
  });

  it("refuses a move to an account that can't take entries, leaving the row untouched", async () => {
    accountAcceptsEntries.mockResolvedValue(false);

    const r = await updateManualTransaction(supabase, "txn-1", input({ accountId: OTHER_ACCOUNT }));
    expect(r).toEqual({
      ok: false,
      error: "invalid",
      fieldErrors: { accountId: "That account can't take transactions right now. Keep the current account or choose another." },
    });
    expect(updateTransactionRow).not.toHaveBeenCalled();
  });

  it("never moves a bank-imported row to another account, even an open one (owner decision 2026-09-30)", async () => {
    readObservedRow.mockResolvedValue(row({ bankSourced: true }));

    const r = await updateManualTransaction(supabase, "txn-1", input({ accountId: OTHER_ACCOUNT }));
    expect(r).toEqual({
      ok: false,
      error: "invalid",
      fieldErrors: { accountId: "A bank transaction stays on the account it came from." },
    });
    expect(accountAcceptsEntries).not.toHaveBeenCalled();
    expect(updateTransactionRow).not.toHaveBeenCalled();
  });

  it("still lets a bank-imported row be edited on its own account", async () => {
    readObservedRow.mockResolvedValue(row({ bankSourced: true }));
    updateTransactionRow.mockResolvedValue({ outcome: "ok" });

    expect(await updateManualTransaction(supabase, "txn-1", input({ categoryId: null }))).toEqual({ ok: true });
    expect(updateTransactionRow.mock.calls[0][2]).toMatchObject({ accountId: ACCOUNT, categoryId: null });
  });

  it("says missing when the row is gone or hidden by RLS, before writing anything", async () => {
    readObservedRow.mockResolvedValue(null);
    expect(await updateManualTransaction(supabase, "t", input())).toEqual({ ok: false, error: "missing" });
    expect(updateTransactionRow).not.toHaveBeenCalled();
  });

  it("maps a vanished row to missing and a concurrent change to conflict", async () => {
    updateTransactionRow.mockResolvedValueOnce({ outcome: "missing" });
    expect(await updateManualTransaction(supabase, "t", input())).toEqual({ ok: false, error: "missing" });
    updateTransactionRow.mockResolvedValueOnce({ outcome: "conflict" });
    expect(await updateManualTransaction(supabase, "t", input())).toEqual({ ok: false, error: "conflict" });
  });

  it("returns field errors without touching the database", async () => {
    const r = await updateManualTransaction(supabase, "t", input({ direction: "sideways" }));
    expect(r).toMatchObject({ ok: false, error: "invalid" });
    expect(updateTransactionRow).not.toHaveBeenCalled();
  });

  it("reports a thrown storage error as failed", async () => {
    updateTransactionRow.mockRejectedValue(new Error("boom"));
    expect(await updateManualTransaction(supabase, "t", input())).toEqual({ ok: false, error: "failed", message: "boom" });
  });
});


describe("deleteTransactionById", () => {
  function deleting(result: { data: unknown; error: { message: string } | null }) {
    return {
      from: () => ({ delete: () => ({ eq: () => ({ select: async () => result }) }) }),
    } as never;
  }

  it("deletes the row visible to the caller", async () => {
    expect(await deleteTransactionById(deleting({ data: [{ id: "t" }], error: null }), "t")).toEqual({ ok: true });
  });

  it("says missing when RLS hides the row or it is already gone", async () => {
    expect(await deleteTransactionById(deleting({ data: [], error: null }), "t")).toEqual({ ok: false, error: "missing" });
  });

  it("reports a database error as failed", async () => {
    expect(await deleteTransactionById(deleting({ data: null, error: { message: "nope" } }), "t")).toEqual({
      ok: false,
      error: "failed",
      message: "nope",
    });
  });
});
