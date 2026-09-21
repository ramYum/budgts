import { beforeEach, describe, expect, it, vi } from "vitest";

const landTransaction = vi.fn();
const updateTransactionRow = vi.fn();
vi.mock("@/lib/ingestion", async (orig) => ({
  ...(await orig<typeof import("@/lib/ingestion")>()),
  landTransaction: (...a: unknown[]) => landTransaction(...a),
  supabaseTransactionStore: () => ({ __store: true }),
}));
vi.mock("@/server/transaction-update", () => ({ updateTransactionRow: (...a: unknown[]) => updateTransactionRow(...a) }));

import { createManualTransaction, deleteTransactionById, updateManualTransaction } from "./commands";

const ACCOUNT = "33333333-3333-4333-8333-333333333333";
const CATEGORY = "44444444-4444-4444-8444-444444444444";
const supabase = { __as: "user-a" } as never;

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
  updateTransactionRow.mockReset();
  landTransaction.mockResolvedValue({ id: "new-id" });
});

describe("createManualTransaction", () => {
  it("lands a validated, normalized manual transaction for the given user", async () => {
    const r = await createManualTransaction(supabase, "user-a", input());

    expect(r).toEqual({ ok: true, id: "new-id" });
    const [store, userId, n] = landTransaction.mock.calls[0];
    expect(store).toEqual({ __store: true });
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

  it("reports a storage failure with its message", async () => {
    landTransaction.mockRejectedValue(new Error("db down"));
    expect(await createManualTransaction(supabase, "user-a", input())).toEqual({ ok: false, error: "failed", message: "db down" });
  });
});

describe("updateManualTransaction", () => {
  it("writes the validated fields and reports ok", async () => {
    updateTransactionRow.mockResolvedValue({ outcome: "ok" });

    const r = await updateManualTransaction(supabase, "txn-1", input({ isTransfer: true }));

    expect(r).toEqual({ ok: true });
    expect(updateTransactionRow).toHaveBeenCalledWith(
      supabase,
      "txn-1",
      expect.objectContaining({ accountId: ACCOUNT, amount: 1234, isTransfer: true }),
    );
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
