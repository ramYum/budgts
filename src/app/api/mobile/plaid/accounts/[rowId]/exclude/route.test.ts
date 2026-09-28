import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const setAccountCalculationExclusion = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/server/plaid/account-exclusion", () => ({
  setAccountCalculationExclusion: (...a: unknown[]) => setAccountCalculationExclusion(...a),
}));

import { PATCH } from "./route";

const ROW = "22222222-2222-4222-8222-222222222222";
const supabase = { __as: "user-a" };
const route = (id = ROW) => ({ params: Promise.resolve({ rowId: id }) });
const patch = (body: unknown, raw = false) =>
  new Request("https://example.test/api/mobile/plaid/accounts/x/exclude", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });

beforeEach(() => {
  getBearerContext.mockReset();
  setAccountCalculationExclusion.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
});

describe("PATCH /api/mobile/plaid/accounts/:rowId/exclude", () => {
  it("excludes/re-includes for the verified user, taking the id from the verified session (never the body)", async () => {
    setAccountCalculationExclusion.mockResolvedValue({ outcome: "ok" });
    const res = await PATCH(patch({ excluded: true }), route());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(setAccountCalculationExclusion).toHaveBeenCalledWith(supabase, "user-a", ROW, true);
  });

  it("answers not_found and needs_review_required with stable codes", async () => {
    setAccountCalculationExclusion.mockResolvedValue({ outcome: "not_found" });
    const missing = await PATCH(patch({ excluded: true }), route());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });

    setAccountCalculationExclusion.mockResolvedValue({ outcome: "needs_review_required" });
    const needsReview = await PATCH(patch({ excluded: true }), route());
    expect(needsReview.status).toBe(409);
    expect(await needsReview.json()).toEqual({ error: "needs_review_required" });
  });

  it("validates the body and the id, and requires authentication", async () => {
    expect((await PATCH(patch({ excluded: "yes" }), route())).status).toBe(422);
    expect((await PATCH(patch({ excluded: true }), route("not-a-uuid"))).status).toBe(404);
    expect(setAccountCalculationExclusion).not.toHaveBeenCalled();
    getBearerContext.mockResolvedValue(null);
    expect((await PATCH(patch({ excluded: true }), route())).status).toBe(401);
  });
});
