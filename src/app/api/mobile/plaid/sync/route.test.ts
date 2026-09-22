import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const syncPlaidItemForUser = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/plaid/sync-commands", () => ({ syncPlaidItemForUser: (...a: unknown[]) => syncPlaidItemForUser(...a) }));

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
  syncPlaidItemForUser.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
});

describe("POST /api/mobile/plaid/sync", () => {
  it("syncs the caller's item through their own client", async () => {
    syncPlaidItemForUser.mockResolvedValue({ outcome: "ok" });
    const res = await POST(post({ itemId: "plaid-item-1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(syncPlaidItemForUser).toHaveBeenCalledWith(supabase, "user-a", "plaid-item-1");
  });

  it("carries a warning through when the sync didn't finish", async () => {
    syncPlaidItemForUser.mockResolvedValue({ outcome: "ok", warning: "Connected, but the first sync didn't finish. It'll retry shortly." });
    expect(await (await POST(post({ itemId: "x" }))).json()).toEqual({
      ok: true,
      warning: "Connected, but the first sync didn't finish. It'll retry shortly.",
    });
  });

  it("answers 404 not_found for an unknown/foreign item", async () => {
    syncPlaidItemForUser.mockResolvedValue({ outcome: "item_not_found" });
    const res = await POST(post({ itemId: "x" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("rejects a missing itemId, an unreadable body, and requires authentication", async () => {
    expect((await POST(post({}))).status).toBe(422);
    expect((await POST(post("nope", true))).status).toBe(400);
    getBearerContext.mockResolvedValue(null);
    expect((await POST(post({ itemId: "x" }))).status).toBe(401);
    expect(syncPlaidItemForUser).not.toHaveBeenCalled();
  });
});
