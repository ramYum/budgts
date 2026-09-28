import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUser = vi.fn();
const createServerClient = vi.fn();
const verifyAccessToken = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSessionUser: () => getSessionUser(),
  createClient: () => createServerClient(),
}));
vi.mock("@/lib/auth/get-request-user", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/get-request-user")>("@/lib/auth/get-request-user");
  return { ...actual, verifyAccessToken: (...a: unknown[]) => verifyAccessToken(...a) };
});
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ __as: "bearer-client" }) }));

import { getRequestContext } from "./request-context";

const req = (headers: Record<string, string> = {}) =>
  new Request("https://example.test/api/plaid/link-token", { headers });
const bearerUser = { id: "user-bearer", email: "b@example.test" };
const cookieUser = { id: "user-cookie", email: "c@example.test" };
const cookieSupabase = { __as: "cookie-client" };

beforeEach(() => {
  getSessionUser.mockReset();
  createServerClient.mockReset();
  verifyAccessToken.mockReset();
  createServerClient.mockResolvedValue(cookieSupabase);
});

describe("getRequestContext", () => {
  it("prefers a Bearer token when present, and never falls back to a cookie in that case", async () => {
    verifyAccessToken.mockResolvedValue(bearerUser);

    const ctx = await getRequestContext(req({ authorization: "Bearer good-token" }));

    expect(ctx?.user).toEqual(bearerUser);
    expect(verifyAccessToken).toHaveBeenCalledWith("good-token");
    expect(getSessionUser).not.toHaveBeenCalled();
    // The returned client must carry the caller's own token (RLS-scoped), never the cookie client.
    expect(ctx?.supabase).toEqual({ __as: "bearer-client" });
  });

  it("returns null for an invalid Bearer token without trying the cookie session", async () => {
    verifyAccessToken.mockResolvedValue(null);
    expect(await getRequestContext(req({ authorization: "Bearer garbage" }))).toBeNull();
    expect(getSessionUser).not.toHaveBeenCalled();
  });

  it("falls back to the cookie session when there is no Authorization header", async () => {
    getSessionUser.mockResolvedValue(cookieUser);
    expect(await getRequestContext(req())).toEqual({ user: cookieUser, supabase: cookieSupabase });
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("returns null when neither a Bearer token nor a cookie session is present", async () => {
    getSessionUser.mockResolvedValue(null);
    expect(await getRequestContext(req())).toBeNull();
  });
});
