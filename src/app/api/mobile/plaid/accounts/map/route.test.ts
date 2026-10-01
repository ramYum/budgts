import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const mapAccountsFor = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/server/plaid/commands", () => ({ mapAccountsFor: (...a: unknown[]) => mapAccountsFor(...a) }));

import { POST } from "./route";

const supabase = { __as: "user-a" };
const ITEM_ROW = "11111111-1111-4111-8111-111111111111";
const post = (body: unknown, raw = false) =>
  new Request("https://example.test/api/mobile/plaid/accounts/map", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
const valid = { plaidItemId: ITEM_ROW, entries: [{ plaidAccountId: "pa-1", mode: "new", name: "Checking", type: "checking" }] };

beforeEach(() => {
  getBearerContext.mockReset();
  mapAccountsFor.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
});

describe("POST /api/mobile/plaid/accounts/map", () => {
  it("maps the caller's accounts with the validated entries", async () => {
    mapAccountsFor.mockResolvedValue({ ok: true, warning: "Accounts saved. The first sync didn't finish. It'll retry shortly." });
    const res = await POST(post(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, warning: expect.stringContaining("Accounts saved") });
    expect(mapAccountsFor).toHaveBeenCalledWith(supabase, "user-a", ITEM_ROW, expect.any(Array));
  });

  it("rejects invalid choices without touching anything", async () => {
    expect((await POST(post({ plaidItemId: "not-a-uuid", entries: [] }))).status).toBe(422);
    expect((await POST(post("nope", true))).status).toBe(400);
    expect(mapAccountsFor).not.toHaveBeenCalled();
  });

  it("rejects invalid choices with the input code, never the refusal one (the app must not offer Refresh for it)", async () => {
    const res = await POST(post({ plaidItemId: "not-a-uuid", entries: [] }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("invalid");
  });

  it("a refusal over what the screen shows (already imported, paused, gone) is `refused`, with the web's sentence", async () => {
    mapAccountsFor.mockResolvedValue({ ok: false, error: "invalid", message: "That account is already imported. Refresh to see where it goes." });
    const res = await POST(post(valid));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "refused", message: "That account is already imported. Refresh to see where it goes." });
  });

  it("a 404 carries the server's own sentence (which thing is gone)", async () => {
    mapAccountsFor.mockResolvedValue({ ok: false, error: "not_found", message: "That bank account no longer exists. Try connecting again." });
    const res = await POST(post(valid));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found", message: "That bank account no longer exists. Try connecting again." });
  });

  it("maps outcomes to stable codes and requires authentication", async () => {
    mapAccountsFor.mockResolvedValue({ ok: false, error: "not_found", message: "gone" });
    expect((await POST(post(valid))).status).toBe(404);
    mapAccountsFor.mockResolvedValue({ ok: false, error: "failed", message: "Could not create the account. Try again." });
    const failed = await POST(post(valid));
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "unavailable" });
    getBearerContext.mockResolvedValue(null);
    expect((await POST(post(valid))).status).toBe(401);
  });
});
