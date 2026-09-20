import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getRequestUser = vi.fn();
const adminSupabase = vi.fn();
const deleteAccount = vi.fn();

vi.mock("@/lib/auth/get-request-user", () => ({ getRequestUser: (...a: unknown[]) => getRequestUser(...a) }));
vi.mock("@/lib/account/delete-account", () => ({ deleteAccount: (...a: unknown[]) => deleteAccount(...a) }));
// Keep the REAL AdminConfigError so the route's `instanceof` check is exercised, but fake the client builder.
vi.mock("@/lib/supabase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/admin")>("@/lib/supabase/admin");
  return { ...actual, adminSupabase: (...a: unknown[]) => adminSupabase(...a) };
});

import * as route from "./route";
import { AdminConfigError } from "@/lib/supabase/admin";

const { POST } = route;
const ADMIN_CLIENT = { __admin: true };
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const FRESH_USER = { id: "user-a", email: "a@example.test", last_sign_in_at: minutesAgo(1) };

function req(init: { headers?: Record<string, string>; body?: string; url?: string } = {}) {
  return new Request(init.url ?? "https://example.test/api/account/delete", { method: "POST", headers: init.headers, body: init.body });
}

let logged: string;
beforeEach(() => {
  getRequestUser.mockReset();
  adminSupabase.mockReset();
  deleteAccount.mockReset();
  adminSupabase.mockReturnValue(ADMIN_CLIENT);
  deleteAccount.mockResolvedValue({ ok: true, alreadyDeleted: false, path: "hard-delete" });
  logged = "";
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void (logged += JSON.stringify(args) + "\n"));
  }
});

/** The single guarantee every refusal must give: nothing was deleted, and the admin client was not even built. */
function expectNothingHappened() {
  expect(deleteAccount).not.toHaveBeenCalled();
}

describe("POST /api/account/delete — refusals never reach the deletion code", () => {
  it("rejects an unauthenticated request with 401 (no session, no Bearer token)", async () => {
    getRequestUser.mockResolvedValue(null);

    const res = await POST(req());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(adminSupabase).not.toHaveBeenCalled();
    expectNothingHappened();
  });

  it("rejects a forged Bearer token with 401 — the request (and its header) is handed to the real verifier, not trusted", async () => {
    getRequestUser.mockResolvedValue(null); // getRequestUser verifies the token with Supabase Auth; a forged one yields null
    const request = req({ headers: { authorization: "Bearer forged.token.value" } });

    const res = await POST(request);

    expect(res.status).toBe(401);
    expect(getRequestUser).toHaveBeenCalledWith(request);
    expectNothingHappened();
  });

  it("rejects a stale sign-in (older than the 10-minute step-up window) with 403 reauth_required", async () => {
    getRequestUser.mockResolvedValue({ ...FRESH_USER, last_sign_in_at: minutesAgo(11) });

    const res = await POST(req());

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("reauth_required");
    expectNothingHappened();
  });

  it("rejects a user with no recorded sign-in time (cannot prove freshness) with 403", async () => {
    getRequestUser.mockResolvedValue({ ...FRESH_USER, last_sign_in_at: undefined });

    expect((await POST(req())).status).toBe(403);
    expectNothingHappened();
  });

  it("only exposes POST: there is no GET (or other verb) that could delete an account", () => {
    const verbs = Object.keys(route).filter((k) => /^(GET|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(k));
    expect(verbs).toEqual([]);
  });
});

describe("POST /api/account/delete — B1: missing or misconfigured admin configuration", () => {
  beforeEach(() => {
    adminSupabase.mockImplementation(() => {
      throw new AdminConfigError(["SUPABASE_SECRET_KEY"]);
    });
  });

  it("returns a generic 503 and performs NO deletion work when the server admin key is not configured", async () => {
    getRequestUser.mockResolvedValue(FRESH_USER);

    const res = await POST(req());

    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("account_deletion_unavailable");
    expectNothingHappened();
  });

  it("does not tell the CLIENT anything about the configuration: no variable names, no 'secret', no 'admin'", async () => {
    getRequestUser.mockResolvedValue(FRESH_USER);

    const res = await POST(req());
    const body = await res.text();

    expect(body).not.toMatch(/SUPABASE|secret|admin|key|env|config/i);
  });

  it("logs a server-side diagnostic naming the missing variable — and no value of any variable", async () => {
    getRequestUser.mockResolvedValue(FRESH_USER);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

    await POST(req());

    expect(logged).toContain("SUPABASE_SECRET_KEY");
    if (url) expect(logged).not.toContain(url);
  });

  it("still answers an UNAUTHENTICATED caller with 401, so an outsider cannot probe whether the server is configured", async () => {
    getRequestUser.mockResolvedValue(null);

    const res = await POST(req());

    expect(res.status).toBe(401);
    expect(adminSupabase).not.toHaveBeenCalled();
  });

  it("does not swallow an UNEXPECTED admin-client failure as a config problem: it is a generic 500", async () => {
    getRequestUser.mockResolvedValue(FRESH_USER);
    adminSupabase.mockImplementation(() => {
      throw new Error("something else entirely");
    });

    const res = await POST(req());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "could not delete account" });
    expectNothingHappened();
  });
});

describe("POST /api/account/delete — identity comes only from the verified session", () => {
  it("deletes exactly the verified user, on the admin client, and returns the result", async () => {
    getRequestUser.mockResolvedValue(FRESH_USER);

    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(deleteAccount).toHaveBeenCalledWith(ADMIN_CLIENT, "user-a");
  });

  it.each([
    ["a JSON body", { body: JSON.stringify({ userId: "victim", user_id: "victim", id: "victim" }), headers: { "content-type": "application/json" } }],
    ["a query string", { url: "https://example.test/api/account/delete?userId=victim&user_id=victim&id=victim" }],
    ["request headers", { headers: { "x-user-id": "victim", "x-supabase-user-id": "victim" } }],
    ["an unparsable body (proves the body is never even read)", { body: "{not json", headers: { "content-type": "application/json" } }],
  ])("a client-supplied user id in %s cannot change whose account is deleted", async (_where, init) => {
    getRequestUser.mockResolvedValue(FRESH_USER);

    const res = await POST(req(init));

    expect(res.status).toBe(200);
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(deleteAccount.mock.calls[0][1]).toBe("user-a");
    expect(JSON.stringify(deleteAccount.mock.calls)).not.toContain("victim");
  });

  it("reports an already-deleted account as success without re-deleting", async () => {
    getRequestUser.mockResolvedValue(FRESH_USER);
    deleteAccount.mockResolvedValue({ ok: true, alreadyDeleted: true, path: "already-deleted" });

    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyDeleted: true, path: "already-deleted" });
  });
});

describe("POST /api/account/delete — failures are generic to the client, detailed only in the server log", () => {
  it("returns a generic 500 when deletion fails, and never echoes the internal error to the client", async () => {
    getRequestUser.mockResolvedValue(FRESH_USER);
    deleteAccount.mockResolvedValue({ ok: false, error: "removing Plaid item item-secret-123 failed: could not remove bank connection" });

    const res = await POST(req());
    const body = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(body)).toEqual({ error: "could not delete account" });
    expect(body).not.toMatch(/item-secret-123|Plaid|bank/i);
    expect(logged).toContain("item-secret-123"); // the detail IS available to the operator
  });

  it("never reports success for a failed deletion (a transient Auth failure must not read as 'deleted')", async () => {
    getRequestUser.mockResolvedValue(FRESH_USER);
    deleteAccount.mockResolvedValue({ ok: false, error: "auth lookup failed (AuthRetryableFetchError, status 500)" });

    const res = await POST(req());

    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBeUndefined();
  });

  it("turns an unexpected throw inside deletion into the same generic 500 (no unhandled rejection, no raw error page)", async () => {
    getRequestUser.mockResolvedValue(FRESH_USER);
    deleteAccount.mockRejectedValue(new Error("boom with internal detail"));

    const res = await POST(req());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "could not delete account" });
  });

  it("turns a throw while VERIFYING the caller (Auth outage) into a generic 500, and deletes nothing", async () => {
    getRequestUser.mockRejectedValue(new Error("auth server unreachable"));

    const res = await POST(req());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "could not delete account" });
    expectNothingHappened();
  });
});
