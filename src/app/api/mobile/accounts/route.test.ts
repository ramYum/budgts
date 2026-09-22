import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const loadAccounts = vi.fn();
const createAccount = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/plaid/ui-flag", () => ({ plaidUiEnabled: () => true }));
vi.mock("@/lib/mobile/reads", async (orig) => ({
  ...(await orig<typeof import("@/lib/mobile/reads")>()),
  loadAccounts: (...a: unknown[]) => loadAccounts(...a),
}));
vi.mock("@/lib/accounts/commands", () => ({ createAccount: (...a: unknown[]) => createAccount(...a) }));

import { GET, POST } from "./route";

const supabase = { __as: "user-a" };
const post = (body: unknown, raw = false) =>
  new Request("https://example.test/api/mobile/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });

beforeEach(() => {
  getBearerContext.mockReset();
  loadAccounts.mockReset();
  createAccount.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
});

describe("GET /api/mobile/accounts", () => {
  it("lists the caller's accounts through their own client", async () => {
    loadAccounts.mockResolvedValue([{ id: "a1", name: "Wallet", type: "cash", source: "manual", archived: false, selectable: true }]);
    const res = await GET(new Request("https://example.test/api/mobile/accounts"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      version: 1,
      accounts: [{ id: "a1", name: "Wallet", type: "cash", source: "manual", archived: false, selectable: true }],
      // The server's own list, so the app's type picker never offers a value the server would reject.
      accountTypes: ["checking", "credit", "cash", "savings"],
    });
    expect(loadAccounts).toHaveBeenCalledWith(supabase, true);
  });

  it("requires authentication and hides read failures", async () => {
    getBearerContext.mockResolvedValue(null);
    expect((await GET(new Request("https://example.test/api/mobile/accounts"))).status).toBe(401);
    getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
    loadAccounts.mockRejectedValue(new Error("x"));
    expect((await GET(new Request("https://example.test/api/mobile/accounts"))).status).toBe(503);
  });
});

describe("POST /api/mobile/accounts", () => {
  it("creates a manual account for the verified user", async () => {
    createAccount.mockResolvedValue({ ok: true, id: "acc-1" });
    const res = await POST(post({ name: "Wallet", type: "cash" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "acc-1" });
    expect(createAccount).toHaveBeenCalledWith(supabase, "user-a", { name: "Wallet", type: "cash" });
  });

  it("maps validation failures and bad bodies", async () => {
    createAccount.mockResolvedValue({ ok: false, error: "invalid", fieldErrors: { name: "Name is required" } });
    const res = await POST(post({ name: "", type: "cash" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "invalid", fieldErrors: { name: "Name is required" } });
    expect((await POST(post("nope", true))).status).toBe(400);
  });

  it("requires authentication", async () => {
    getBearerContext.mockResolvedValue(null);
    expect((await POST(post({ name: "x", type: "cash" }))).status).toBe(401);
    expect(createAccount).not.toHaveBeenCalled();
  });
});
