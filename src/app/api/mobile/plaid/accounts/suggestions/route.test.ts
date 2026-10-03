import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const loadMappingSuggestions = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/plaid/mapping-suggestions", () => ({ loadMappingSuggestions: (...a: unknown[]) => loadMappingSuggestions(...a) }));

import { GET } from "./route";

const ITEM = "11111111-1111-4111-8111-111111111111";
const supabase = { __as: "user-a" };
const req = (q: string) => new Request(`https://example.test/api/mobile/plaid/accounts/suggestions${q}`);

beforeEach(() => {
  getBearerContext.mockReset();
  loadMappingSuggestions.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
});

describe("GET /api/mobile/plaid/accounts/suggestions", () => {
  it("answers the caller's suggestions for one connection, read through their own client", async () => {
    const suggestions = { "pa-1": { kind: "previous", accountId: "a1", accountName: "Chase" } };
    loadMappingSuggestions.mockResolvedValue(suggestions);
    const res = await GET(req(`?plaidItemId=${ITEM}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 1, suggestions });
    expect(loadMappingSuggestions).toHaveBeenCalledWith(supabase, "user-a", ITEM);
  });

  it("refuses a missing or malformed connection id without reading", async () => {
    expect((await GET(req(""))).status).toBe(400);
    expect((await GET(req("?plaidItemId=nope"))).status).toBe(400);
    expect(loadMappingSuggestions).not.toHaveBeenCalled();
  });

  it("404s a connection that is not the caller's (RLS reads nothing)", async () => {
    loadMappingSuggestions.mockResolvedValue(null);
    const res = await GET(req(`?plaidItemId=${ITEM}`));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("401s without a session", async () => {
    getBearerContext.mockResolvedValue(null);
    expect((await GET(req(`?plaidItemId=${ITEM}`))).status).toBe(401);
  });
});
