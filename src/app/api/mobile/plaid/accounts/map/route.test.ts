import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const mapPlaidAccounts = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/plaid/account-mapping-commands", () => ({ mapPlaidAccounts: (...a: unknown[]) => mapPlaidAccounts(...a) }));

import { POST } from "./route";

const supabase = { __as: "user-a" };
const ITEM_ROW = "11111111-1111-4111-8111-111111111111";
const post = (body: unknown, raw = false) =>
  new Request("https://example.test/api/mobile/plaid/accounts/map", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });

beforeEach(() => {
  getBearerContext.mockReset();
  mapPlaidAccounts.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
});

describe("POST /api/mobile/plaid/accounts/map", () => {
  const validBody = { plaidItemId: ITEM_ROW, entries: [{ plaidAccountId: "pa1", mode: "ignore" }] };

  it("maps for the verified user through their own client", async () => {
    mapPlaidAccounts.mockResolvedValue({ outcome: "ok" });
    const res = await POST(post(validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mapPlaidAccounts).toHaveBeenCalledWith(supabase, "user-a", ITEM_ROW, validBody.entries);
  });

  it("carries a warning through when the first sync didn't finish", async () => {
    mapPlaidAccounts.mockResolvedValue({ outcome: "ok", warning: "Accounts saved. The first sync didn't finish — it'll retry shortly." });
    const res = await POST(post(validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, warning: "Accounts saved. The first sync didn't finish — it'll retry shortly." });
  });

  it("maps item_not_found to 404 and a storage failure to a generic 503", async () => {
    mapPlaidAccounts.mockResolvedValue({ outcome: "item_not_found" });
    const notFound = await POST(post(validBody));
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({ error: "not_found" });

    mapPlaidAccounts.mockResolvedValue({ outcome: "failed", message: "Could not create the account. Try again." });
    const failed = await POST(post(validBody));
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "unavailable" });
  });

  it("validates the body before calling the command", async () => {
    const res = await POST(post({ plaidItemId: "not-a-uuid", entries: [] }));
    expect(res.status).toBe(422);
    expect(mapPlaidAccounts).not.toHaveBeenCalled();
  });

  it("rejects an unreadable body and requires authentication", async () => {
    expect((await POST(post("nope", true))).status).toBe(400);
    getBearerContext.mockResolvedValue(null);
    expect((await POST(post(validBody))).status).toBe(401);
    expect(mapPlaidAccounts).not.toHaveBeenCalled();
  });
});
