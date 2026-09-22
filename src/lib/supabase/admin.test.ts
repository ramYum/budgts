import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const createClient = vi.fn<(...args: unknown[]) => unknown>(() => ({ __admin: true }));
vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: unknown[]) => createClient(...a) }));

const URL_VALUE = "https://sentinel-project-ref.supabase.co";
const SECRET_VALUE = "sb_secret_SENTINEL_VALUE_that_must_never_leak";

const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, secret: process.env.SUPABASE_SECRET_KEY };

/** A fresh module each time: admin.ts caches its client at module scope. */
async function load() {
  vi.resetModules();
  return import("./admin");
}

beforeEach(() => {
  createClient.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
  process.env.SUPABASE_SECRET_KEY = SECRET_VALUE;
});

afterEach(() => {
  if (saved.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
  if (saved.secret === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = saved.secret;
});

describe("adminSupabase", () => {
  it("builds a service-role client without session persistence, and reuses it", async () => {
    const { adminSupabase } = await load();

    const a = adminSupabase();
    const b = adminSupabase();

    expect(a).toBe(b);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(URL_VALUE, SECRET_VALUE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  it("throws a typed AdminConfigError naming the missing variable — and only its NAME — when the secret key is absent", async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    const { adminSupabase, AdminConfigError } = await load();

    let caught: unknown;
    try {
      adminSupabase();
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(AdminConfigError);
    expect((caught as InstanceType<typeof AdminConfigError>).missing).toEqual(["SUPABASE_SECRET_KEY"]);
    expect((caught as Error).message).toContain("SUPABASE_SECRET_KEY");
    // The message is safe to log server-side: it carries no value of ANY variable.
    expect((caught as Error).message).not.toContain(URL_VALUE);
    expect((caught as Error).message).not.toContain(SECRET_VALUE);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("names the URL variable when only the URL is missing, and both when both are", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const onlyUrl = await load();
    expect(() => onlyUrl.adminSupabase()).toThrow(onlyUrl.AdminConfigError);
    try {
      onlyUrl.adminSupabase();
    } catch (e) {
      expect((e as InstanceType<typeof onlyUrl.AdminConfigError>).missing).toEqual(["NEXT_PUBLIC_SUPABASE_URL"]);
    }

    delete process.env.SUPABASE_SECRET_KEY;
    const both = await load();
    try {
      both.adminSupabase();
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as InstanceType<typeof both.AdminConfigError>).missing).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"]);
    }
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty string", ""],
    ["whitespace only", "   \n"],
  ])("treats %s as missing (a blank variable in Vercel is not a configured secret)", async (_label, blank) => {
    process.env.SUPABASE_SECRET_KEY = blank;
    const { adminSupabase, AdminConfigError } = await load();

    expect(() => adminSupabase()).toThrow(AdminConfigError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("does not cache a failed configuration: once the variable is set, the next call succeeds", async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    const { adminSupabase, AdminConfigError } = await load();
    expect(() => adminSupabase()).toThrow(AdminConfigError);

    process.env.SUPABASE_SECRET_KEY = SECRET_VALUE;

    expect(adminSupabase()).toEqual({ __admin: true });
  });
});
