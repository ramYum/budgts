import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const setAccountImportingFor = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/server/plaid/commands", () => ({ setAccountImportingFor: (...a: unknown[]) => setAccountImportingFor(...a) }));

import { PATCH } from "./route";

const supabase = { __as: "user-a" };
const ROW = "22222222-2222-4222-8222-222222222222";
const patch = (body: unknown, raw = false) =>
  new Request(`https://example.test/api/mobile/plaid/accounts/${ROW}/importing`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
const route = (rowId = ROW) => ({ params: Promise.resolve({ rowId }) });

beforeEach(() => {
  getBearerContext.mockReset();
  setAccountImportingFor.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
});

describe("PATCH /api/mobile/plaid/accounts/:rowId/importing", () => {
  it("turns importing on or off for the caller's account", async () => {
    setAccountImportingFor.mockResolvedValue({ ok: true });
    const res = await PATCH(patch({ importing: false }), route());
    expect(res.status).toBe(200);
    expect(setAccountImportingFor).toHaveBeenCalledWith(supabase, "user-a", ROW, false);
  });

  it("explains why an unmapped account cannot resume (422 with the web's message)", async () => {
    setAccountImportingFor.mockResolvedValue({ ok: false, error: "invalid", message: "Choose which Budgts account to import into first." });
    const res = await PATCH(patch({ importing: true }), route());
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "invalid", fieldErrors: { form: "Choose which Budgts account to import into first." } });
  });

  it("validates the id and body, and requires authentication", async () => {
    expect((await PATCH(patch({ importing: true }), route("nope"))).status).toBe(404);
    expect((await PATCH(patch({ importing: "yes" }), route())).status).toBe(422);
    expect((await PATCH(patch("x", true), route())).status).toBe(400);
    setAccountImportingFor.mockResolvedValue({ ok: false, error: "not_found", message: "gone" });
    expect((await PATCH(patch({ importing: true }), route())).status).toBe(404);
    getBearerContext.mockResolvedValue(null);
    expect((await PATCH(patch({ importing: true }), route())).status).toBe(401);
  });
});
