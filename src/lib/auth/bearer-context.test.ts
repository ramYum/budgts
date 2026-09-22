import { beforeEach, describe, expect, it, vi } from "vitest";

const getRequestUser = vi.fn();
const createClient = vi.fn<(...args: unknown[]) => unknown>(() => ({ __client: true }));

vi.mock("@/lib/auth/get-request-user", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/get-request-user")>(
    "@/lib/auth/get-request-user",
  );
  return { ...actual, getRequestUser: (...a: unknown[]) => getRequestUser(...a) };
});
vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: unknown[]) => createClient(...a) }));

import { getBearerContext } from "./bearer-context";

const URL_ = "https://example.supabase.co";
const KEY = "sb_publishable_test";

function req(headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/mobile/home", { headers });
}

beforeEach(() => {
  getRequestUser.mockReset();
  createClient.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL_;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = KEY;
});

describe("getBearerContext", () => {
  it("requires a Bearer token: a request with none is rejected without any lookup (no cookie fallback)", async () => {
    expect(await getBearerContext(req())).toBeNull();
    expect(await getBearerContext(req({ cookie: "sb-access-token=abc" }))).toBeNull();
    expect(getRequestUser).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects a token Supabase Auth does not verify", async () => {
    getRequestUser.mockResolvedValue(null);
    expect(await getBearerContext(req({ authorization: "Bearer forged" }))).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns the VERIFIED user and a client that carries the caller's own token", async () => {
    const user = { id: "user-a", email: "a@example.test" };
    getRequestUser.mockResolvedValue(user);

    const ctx = await getBearerContext(req({ authorization: "Bearer good-token" }));

    expect(ctx?.user).toBe(user);
    expect(createClient).toHaveBeenCalledTimes(1);
    const [url, key, options] = createClient.mock.calls[0] as [
      string,
      string,
      { global: { headers: Record<string, string> }; auth: Record<string, boolean> },
    ];
    expect(url).toBe(URL_);
    expect(key).toBe(KEY); // the public publishable key — never the secret key
    expect(options.global.headers.Authorization).toBe("Bearer good-token"); // so RLS sees auth.uid()
    expect(options.auth.persistSession).toBe(false);
    expect(options.auth.autoRefreshToken).toBe(false);
  });

  it("never uses the service/secret key", async () => {
    process.env.SUPABASE_SECRET_KEY = "sb_secret_should_never_be_used";
    getRequestUser.mockResolvedValue({ id: "u" });

    await getBearerContext(req({ authorization: "Bearer t" }));

    expect(createClient.mock.calls[0]![1]).not.toBe("sb_secret_should_never_be_used");
  });
});
