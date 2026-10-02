import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const loadConnectedBanks = vi.fn();
let plaidOn = true;
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/plaid/connected-banks-read", () => ({ loadConnectedBanks: (...a: unknown[]) => loadConnectedBanks(...a) }));
vi.mock("@/lib/plaid/ui-flag", () => ({ plaidUiEnabled: () => plaidOn }));

import { GET } from "./route";

const supabase = { __as: "user-a" };
const req = () => new Request("https://example.test/api/mobile/plaid/banks");

beforeEach(() => {
  plaidOn = true;
  getBearerContext.mockReset();
  loadConnectedBanks.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
});

describe("GET /api/mobile/plaid/banks", () => {
  it("lists the caller's connected banks and mapping choices through their own client", async () => {
    loadConnectedBanks.mockResolvedValue({ banks: [{ id: "item-1" }], budgtsAccounts: [{ id: "a1", name: "Wallet" }], connectionsRemovedForLapse: false });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      version: 1,
      enabled: true,
      banks: [{ id: "item-1" }],
      budgtsAccounts: [{ id: "a1", name: "Wallet" }],
      connectionsRemovedForLapse: false,
    });
    expect(loadConnectedBanks).toHaveBeenCalledWith(supabase);
  });

  it("says when the caller's banks were removed because their subscription ended", async () => {
    loadConnectedBanks.mockResolvedValue({ banks: [], budgtsAccounts: [], connectionsRemovedForLapse: true });
    expect(await (await GET(req())).json()).toMatchObject({ enabled: true, banks: [], connectionsRemovedForLapse: true });
  });

  it("says bank connections are unavailable (not an empty list that looks final) when Plaid is off or absent", async () => {
    loadConnectedBanks.mockResolvedValue(null);
    expect(await (await GET(req())).json()).toMatchObject({ enabled: false, banks: [] });
    plaidOn = false;
    expect(await (await GET(req())).json()).toMatchObject({ enabled: false, banks: [] });
  });

  it("requires authentication", async () => {
    getBearerContext.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
    expect(loadConnectedBanks).not.toHaveBeenCalled();
  });
});
