import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUser = vi.fn();
const createClient = vi.fn();
const authGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSessionUser: () => getSessionUser(),
  createClient: () => createClient(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: (t: string) => authGetUser(t) } }),
}));

import { getRequestContext } from "./request-context";

const req = (headers: Record<string, string> = {}) => new Request("https://example.test/api/plaid/link-token", { headers });
const bearerUser = { id: "user-bearer", email: "b@example.test" };
const cookieUser = { id: "user-cookie", email: "c@example.test" };
const cookieSupabase = { __as: "cookie-client" };

beforeEach(() => {
  getSessionUser.mockReset();
  createClient.mockReset();
  authGetUser.mockReset();
  createClient.mockResolvedValue(cookieSupabase);
});

describe("getRequestContext", () => {
  it("prefers a Bearer token when present, and never falls back to a cookie in that case", async () => {
    authGetUser.mockResolvedValue({ data: { user: bearerUser }, error: null });

    const ctx = await getRequestContext(req({ authorization: "Bearer good-token" }));

    expect(ctx?.user).toEqual(bearerUser);
    expect(authGetUser).toHaveBeenCalledWith("good-token");
    expect(getSessionUser).not.toHaveBeenCalled();
    // The returned client must carry the caller's own token (RLS-scoped), never the cookie client.
    expect(ctx?.supabase).not.toBe(cookieSupabase);
  });

  it("returns null for an invalid Bearer token without trying the cookie session", async () => {
    authGetUser.mockResolvedValue({ data: { user: null }, error: { message: "bad token" } });
    expect(await getRequestContext(req({ authorization: "Bearer garbage" }))).toBeNull();
    expect(getSessionUser).not.toHaveBeenCalled();
  });

  it("falls back to the cookie session when there is no Authorization header", async () => {
    getSessionUser.mockResolvedValue(cookieUser);

    const ctx = await getRequestContext(req());

    expect(ctx).toEqual({ user: cookieUser, supabase: cookieSupabase });
    expect(authGetUser).not.toHaveBeenCalled();
  });

  it("returns null when neither a Bearer token nor a cookie session is present", async () => {
    getSessionUser.mockResolvedValue(null);
    expect(await getRequestContext(req())).toBeNull();
  });
});
