import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
const getUser = vi.fn();
const createClient = vi.fn<(...args: unknown[]) => unknown>(() => ({ auth: { getClaims, getUser } }));
const getSessionUser = vi.fn();

vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: unknown[]) => createClient(...a) }));
vi.mock("@/lib/supabase/server", () => ({ getSessionUser: () => getSessionUser() }));

import { bearerToken, getRequestUser, verifyAccessToken } from "./get-request-user";

const req = (headers: Record<string, string> = {}) =>
  new Request("https://example.test/api/mobile/session", { headers });

beforeEach(() => {
  getClaims.mockReset();
  getUser.mockReset();
  getSessionUser.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
});

describe("bearerToken", () => {
  it("reads only a well-formed Bearer header", () => {
    expect(bearerToken(req({ authorization: "Bearer abc" }))).toBe("abc");
    expect(bearerToken(req({ authorization: "Bearer   " }))).toBeNull();
    expect(bearerToken(req({ authorization: "Basic abc" }))).toBeNull();
    expect(bearerToken(req())).toBeNull();
  });
});

describe("verifyAccessToken", () => {
  it("verifies the token itself with getClaims (local JWKS check), never the network getUser()", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-a", email: "a@example.test" } }, error: null });

    expect(await verifyAccessToken("good-token")).toEqual({ id: "user-a", email: "a@example.test" });
    expect(getClaims).toHaveBeenCalledWith("good-token");
    expect(getUser).not.toHaveBeenCalled();
  });

  it("uses the public publishable key, never the secret key", async () => {
    process.env.SUPABASE_SECRET_KEY = "sb_secret_should_never_be_used";
    getClaims.mockResolvedValue({ data: { claims: { sub: "u" } }, error: null });
    await verifyAccessToken("t");
    for (const call of createClient.mock.calls) expect(call[1]).not.toBe("sb_secret_should_never_be_used");
  });

  it("returns null for a token that does not verify, or that makes getClaims throw", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "invalid signature" } });
    expect(await verifyAccessToken("forged")).toBeNull();
    getClaims.mockRejectedValue(new Error("malformed"));
    expect(await verifyAccessToken("garbage")).toBeNull();
  });
});

describe("getRequestUser", () => {
  it("prefers a Bearer token and never falls back to the cookie session", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "expired" } });
    expect(await getRequestUser(req({ authorization: "Bearer expired" }))).toBeNull();
    expect(getSessionUser).not.toHaveBeenCalled();
  });

  it("uses the cookie session when there is no Bearer header", async () => {
    getSessionUser.mockResolvedValue({ id: "cookie-user", email: undefined });
    expect(await getRequestUser(req())).toEqual({ id: "cookie-user", email: undefined });
    expect(getClaims).not.toHaveBeenCalled();
  });
});
