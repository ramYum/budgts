import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const updateAccount = vi.fn();
const setAccountArchived = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/accounts/commands", () => ({
  updateAccount: (...a: unknown[]) => updateAccount(...a),
  setAccountArchived: (...a: unknown[]) => setAccountArchived(...a),
}));

import { PATCH } from "./route";

const ID = "66666666-6666-4666-8666-666666666666";
const supabase = { __as: "user-a" };
const route = (id = ID) => ({ params: Promise.resolve({ id }) });
const patch = (body: unknown, raw = false) =>
  new Request("https://example.test/api/mobile/accounts/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });

beforeEach(() => {
  getBearerContext.mockReset();
  updateAccount.mockReset();
  setAccountArchived.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
});

describe("PATCH /api/mobile/accounts/:id", () => {
  it("archives or restores when the body is `{ archived }`", async () => {
    setAccountArchived.mockResolvedValue({ ok: true });
    expect((await PATCH(patch({ archived: true }), route())).status).toBe(200);
    expect(setAccountArchived).toHaveBeenCalledWith(supabase, ID, true);
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("renames / retypes otherwise", async () => {
    updateAccount.mockResolvedValue({ ok: true });
    const body = { name: "Main", type: "checking" };
    expect((await PATCH(patch(body), route())).status).toBe(200);
    expect(updateAccount).toHaveBeenCalledWith(supabase, ID, body);
    expect(setAccountArchived).not.toHaveBeenCalled();
  });

  it("maps missing (another user's account looks identical) and invalid", async () => {
    updateAccount.mockResolvedValueOnce({ ok: false, error: "missing" });
    const missing = await PATCH(patch({ name: "x", type: "cash" }), route());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });

    updateAccount.mockResolvedValueOnce({ ok: false, error: "invalid", fieldErrors: { name: "Name is required" } });
    expect((await PATCH(patch({ name: "", type: "cash" }), route())).status).toBe(422);
  });

  it("guards the id, the body and the caller", async () => {
    expect((await PATCH(patch({}), route("nope"))).status).toBe(404);
    expect((await PATCH(patch("nope", true), route())).status).toBe(400);
    expect((await PATCH(patch("[1]", true), route())).status).toBe(400);
    getBearerContext.mockResolvedValue(null);
    expect((await PATCH(patch({}), route())).status).toBe(401);
    expect(updateAccount).not.toHaveBeenCalled();
    expect(setAccountArchived).not.toHaveBeenCalled();
  });
});
