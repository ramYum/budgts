import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const loadTransactionsPage = vi.fn();
const createManualTransaction = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/plaid/ui-flag", () => ({ plaidUiEnabled: () => true }));
vi.mock("@/lib/mobile/reads", async (orig) => ({
  ...(await orig<typeof import("@/lib/mobile/reads")>()),
  loadTransactionsPage: (...a: unknown[]) => loadTransactionsPage(...a),
}));
vi.mock("@/lib/transactions/commands", () => ({ createManualTransaction: (...a: unknown[]) => createManualTransaction(...a) }));

import { encodeCursor } from "@/lib/mobile/reads";
import { GET, POST } from "./route";

const UUID = "44444444-4444-4444-8444-444444444444";
const supabase = { __as: "user-a" };
const get = (qs = "") => new Request(`https://example.test/api/mobile/transactions${qs}`);
const post = (body: unknown, raw = false) =>
  new Request("https://example.test/api/mobile/transactions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });

beforeEach(() => {
  getBearerContext.mockReset();
  loadTransactionsPage.mockReset();
  createManualTransaction.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
  loadTransactionsPage.mockResolvedValue({ items: [], nextCursor: null });
});

describe("GET /api/mobile/transactions", () => {
  it("rejects an unauthenticated request without reading", async () => {
    getBearerContext.mockResolvedValue(null);
    expect((await GET(get())).status).toBe(401);
    expect(loadTransactionsPage).not.toHaveBeenCalled();
  });

  it("reads the requested month through the caller's own client, with sane defaults", async () => {
    const res = await GET(get("?month=2026-09"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 1, month: "2026-09", items: [], nextCursor: null });
    expect(loadTransactionsPage).toHaveBeenCalledWith(supabase, {
      month: "2026-09",
      categoryId: null,
      search: null,
      limit: 50,
      cursor: null,
      plaidOn: true,
    });
  });

  it("clamps the page size and trims the search", async () => {
    await GET(get("?month=2026-09&limit=100000&search=%20coffee%20"));
    expect(loadTransactionsPage.mock.calls[0][1]).toMatchObject({ limit: 100, search: "coffee" });
    await GET(get("?month=2026-09&limit=0"));
    expect(loadTransactionsPage.mock.calls[1][1].limit).toBe(1);
    await GET(get("?month=2026-09&limit=abc"));
    expect(loadTransactionsPage.mock.calls[2][1].limit).toBe(50);
  });

  it("passes a valid cursor and category through", async () => {
    const cursor = { occurredAt: "2026-09-10T12:00:00.000Z", id: UUID };
    await GET(get(`?month=2026-09&category=${UUID}&cursor=${encodeCursor(cursor)}`));
    expect(loadTransactionsPage.mock.calls[0][1]).toMatchObject({ categoryId: UUID, cursor });
  });

  it.each([
    ["?month=2026-13", "invalid_month"],
    ["?month=September", "invalid_month"],
    ["?month=2026-09&category=not-a-uuid", "invalid_category"],
    ["?month=2026-09&cursor=garbage", "invalid_cursor"],
  ])("rejects %s with %s and reads nothing", async (qs, code) => {
    const res = await GET(get(qs));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: code });
    expect(loadTransactionsPage).not.toHaveBeenCalled();
  });

  it("answers a generic 503 when the read fails", async () => {
    loadTransactionsPage.mockRejectedValue(new Error("relation does not exist"));
    const res = await GET(get("?month=2026-09"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });
});

describe("POST /api/mobile/transactions", () => {
  const body = { accountId: UUID, categoryId: null, amount: "12.34", direction: "debit", occurredAt: "2026-09-10", requestId: "req-1234abcd" };

  it("creates for the verified user, passing the request id for idempotency", async () => {
    createManualTransaction.mockResolvedValue({ ok: true, id: "new-id" });

    const res = await POST(post(body));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "new-id" });
    expect(createManualTransaction).toHaveBeenCalledWith(supabase, "user-a", body, "req-1234abcd");
  });

  it("returns the command's failures as stable codes", async () => {
    createManualTransaction.mockResolvedValue({ ok: false, error: "invalid", fieldErrors: { amount: "Enter a valid amount like 12.34" } });
    const res = await POST(post({ ...body, amount: "x" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "invalid", fieldErrors: { amount: "Enter a valid amount like 12.34" } });

    createManualTransaction.mockResolvedValue({ ok: false, error: "failed", message: "db down" });
    const failed = await POST(post(body));
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("db down");
  });

  it.each([["nope"], ["null"], ["[1,2]"], ['"text"']])("rejects a body that is not a JSON object (%s)", async (raw) => {
    const res = await POST(post(raw, true));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
    expect(createManualTransaction).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request without writing", async () => {
    getBearerContext.mockResolvedValue(null);
    expect((await POST(post(body))).status).toBe(401);
    expect(createManualTransaction).not.toHaveBeenCalled();
  });
});
