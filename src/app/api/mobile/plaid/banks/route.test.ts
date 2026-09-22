import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const loadConnectedBanksData = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/plaid/connected-banks-read", () => ({
  loadConnectedBanksData: (...a: unknown[]) => loadConnectedBanksData(...a),
}));

import { GET } from "./route";

const supabase = { __as: "user-a" };
const req = () => new Request("https://example.test/api/mobile/plaid/banks");

beforeEach(() => {
  getBearerContext.mockReset();
  loadConnectedBanksData.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
  loadConnectedBanksData.mockResolvedValue([]);
});

describe("GET /api/mobile/plaid/banks", () => {
  it("lists the caller's connected banks through their own client", async () => {
    loadConnectedBanksData.mockResolvedValue([{ id: "item-1", itemId: "plaid-1", institutionName: "SoFi" }]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 1, banks: [{ id: "item-1", itemId: "plaid-1", institutionName: "SoFi" }] });
    expect(loadConnectedBanksData).toHaveBeenCalledWith(supabase);
  });

  it("requires authentication and hides read failures", async () => {
    getBearerContext.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
    getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
    loadConnectedBanksData.mockRejectedValue(new Error("db down"));
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("db down");
  });
});
