import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const syncConnectionFor = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/server/plaid/commands", () => ({ syncConnectionFor: (...a: unknown[]) => syncConnectionFor(...a) }));

import { POST } from "./route";

const supabase = { __as: "user-a" };
const post = (body: unknown, raw = false) =>
  new Request("https://example.test/api/mobile/plaid/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });

beforeEach(() => {
  getBearerContext.mockReset();
  syncConnectionFor.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
});

describe("POST /api/mobile/plaid/sync", () => {
  it("syncs the caller's Item through their own client and verified id", async () => {
    syncConnectionFor.mockResolvedValue({ ok: true });
    const res = await POST(post({ itemId: "plaid-item-1", userId: "victim" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(syncConnectionFor).toHaveBeenCalledWith(supabase, "user-a", "plaid-item-1");
  });

  it("passes a sync warning through, and maps not_found / failed to stable codes", async () => {
    syncConnectionFor.mockResolvedValue({ ok: true, warning: "Connected, but the first sync didn't finish. It'll retry shortly." });
    expect(await (await POST(post({ itemId: "x" }))).json()).toMatchObject({ ok: true, warning: expect.any(String) });
    syncConnectionFor.mockResolvedValue({ ok: false, error: "not_found", message: "That bank connection no longer exists." });
    const missing = await POST(post({ itemId: "x" }));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found", message: "That bank connection no longer exists." });
    syncConnectionFor.mockResolvedValue({ ok: false, error: "failed", message: "internal" });
    expect((await POST(post({ itemId: "x" }))).status).toBe(503);
  });

  it("validates the body and requires authentication", async () => {
    expect((await POST(post("nope", true))).status).toBe(400);
    expect((await POST(post({}))).status).toBe(422);
    getBearerContext.mockResolvedValue(null);
    expect((await POST(post({ itemId: "x" }))).status).toBe(401);
    expect(syncConnectionFor).not.toHaveBeenCalled();
  });
});
