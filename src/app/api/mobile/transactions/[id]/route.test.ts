import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const updateManualTransaction = vi.fn();
const deleteTransactionById = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/transactions/commands", () => ({
  updateManualTransaction: (...a: unknown[]) => updateManualTransaction(...a),
  deleteTransactionById: (...a: unknown[]) => deleteTransactionById(...a),
}));

import { DELETE, PATCH } from "./route";

const ID = "55555555-5555-4555-8555-555555555555";
const supabase = { __as: "user-a" };
const route = (id = ID) => ({ params: Promise.resolve({ id }) });
const patch = (body: unknown, raw = false) =>
  new Request("https://example.test/api/mobile/transactions/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
const del = () => new Request("https://example.test/api/mobile/transactions/x", { method: "DELETE" });

beforeEach(() => {
  getBearerContext.mockReset();
  updateManualTransaction.mockReset();
  deleteTransactionById.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
});

describe("PATCH /api/mobile/transactions/:id", () => {
  it("edits through the caller's own client", async () => {
    updateManualTransaction.mockResolvedValue({ ok: true });
    const body = { amount: "5.00" };

    const res = await PATCH(patch(body), route());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updateManualTransaction).toHaveBeenCalledWith(supabase, ID, body);
  });

  it.each([
    [{ ok: false, error: "missing" }, 404, { error: "not_found" }],
    [{ ok: false, error: "conflict" }, 409, { error: "conflict" }],
    [{ ok: false, error: "invalid", fieldErrors: { amount: "bad" } }, 422, { error: "invalid", fieldErrors: { amount: "bad" } }],
  ])("maps %j to %i", async (failure, status, expected) => {
    updateManualTransaction.mockResolvedValue(failure);
    const res = await PATCH(patch({}), route());
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(expected);
  });

  it("answers not_found for a malformed id without touching the database", async () => {
    const res = await PATCH(patch({}), route("../../etc"));
    expect(res.status).toBe(404);
    expect(updateManualTransaction).not.toHaveBeenCalled();
  });

  it("rejects an unreadable body and an unauthenticated caller", async () => {
    expect((await PATCH(patch("nope", true), route())).status).toBe(400);
    getBearerContext.mockResolvedValue(null);
    expect((await PATCH(patch({}), route())).status).toBe(401);
    expect(updateManualTransaction).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/mobile/transactions/:id", () => {
  it("deletes a visible row", async () => {
    deleteTransactionById.mockResolvedValue({ ok: true });
    const res = await DELETE(del(), route());
    expect(res.status).toBe(200);
    expect(deleteTransactionById).toHaveBeenCalledWith(supabase, ID);
  });

  it("says not_found when the row is not visible to the caller (another user's id looks identical to a missing one)", async () => {
    deleteTransactionById.mockResolvedValue({ ok: false, error: "missing" });
    const res = await DELETE(del(), route());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("requires authentication", async () => {
    getBearerContext.mockResolvedValue(null);
    expect((await DELETE(del(), route())).status).toBe(401);
    expect(deleteTransactionById).not.toHaveBeenCalled();
  });
});
