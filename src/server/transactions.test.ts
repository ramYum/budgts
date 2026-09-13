import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const fakeSupabase = { auth: { getUser } };
const createClient = vi.fn(async () => fakeSupabase);
const redirect = vi.fn((url: string) => {
  throw new Error(`redirect:${url}`);
});
const revalidatePath = vi.fn();
const updateTransactionRow = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock("@/server/transaction-update", () => ({ updateTransactionRow: (...a: unknown[]) => updateTransactionRow(...a) }));

const { updateTransaction } = await import("./transactions");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TXN_ID = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";

function form(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    id: TXN_ID,
    accountId: ACCOUNT_ID,
    categoryId: "",
    amount: "12.34",
    direction: "debit",
    occurredAt: "2026-09-10",
    description: "Coffee",
    note: "",
    ...over,
  };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
});

describe("updateTransaction", () => {
  it("returns an error without touching the DB when id is missing from the form", async () => {
    const fd = form();
    fd.delete("id");
    const result = await updateTransaction({}, fd);
    expect(result).toEqual({ error: "Missing transaction id" });
    expect(updateTransactionRow).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid input without touching the DB", async () => {
    const result = await updateTransaction({}, form({ accountId: "not-a-uuid" }));
    expect(result.fieldErrors).toBeDefined();
    expect(updateTransactionRow).not.toHaveBeenCalled();
  });

  it("calls updateTransactionRow with the normalized fields and returns ok on success", async () => {
    updateTransactionRow.mockResolvedValue({ outcome: "ok" });

    const result = await updateTransaction({}, form({ isTransfer: "on" }));

    expect(result).toEqual({ ok: true });
    expect(updateTransactionRow).toHaveBeenCalledWith(
      fakeSupabase,
      TXN_ID,
      expect.objectContaining({
        accountId: ACCOUNT_ID,
        categoryId: null,
        amount: 1234,
        direction: "debit",
        description: "Coffee",
        note: null,
        isTransfer: true,
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("surfaces the existing missing-row error when updateTransactionRow reports 'missing'", async () => {
    updateTransactionRow.mockResolvedValue({ outcome: "missing" });

    const result = await updateTransaction({}, form());

    expect(result).toEqual({ error: "That transaction no longer exists. Refresh and try again." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces a distinct conflict error when updateTransactionRow reports 'conflict'", async () => {
    updateTransactionRow.mockResolvedValue({ outcome: "conflict" });

    const result = await updateTransaction({}, form());

    expect(result.error).toBeTruthy();
    expect(result.error).not.toBe("That transaction no longer exists. Refresh and try again.");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
