import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
const disconnectPlaidItem = vi.fn();
vi.mock("@/server/plaid/disconnect", () => ({ disconnectPlaidItem: (...a: unknown[]) => disconnectPlaidItem(...a) }));

import { deleteAccount, hasMonetizationHistory } from "./delete-account";

const HISTORY_TABLES = ["redemptions", "subscriptions", "payments", "revenue_allocations"];

/** The exact error shapes supabase-js's Auth ADMIN api returns — measured against the real service, not invented. */
const AUTH = {
  notFound: { name: "AuthApiError", status: 404, code: "user_not_found", message: "User not found" },
  notFoundNoCode: { name: "AuthApiError", status: 404, code: null, message: "User not found" },
  http500: { name: "AuthRetryableFetchError", status: 500, code: null, message: "upstream" },
  http502: { name: "AuthRetryableFetchError", status: 502, code: null, message: "upstream" },
  http503: { name: "AuthRetryableFetchError", status: 503, code: null, message: "upstream" },
  networkDown: { name: "AuthRetryableFetchError", status: 0, code: null, message: "fetch failed" },
  rateLimited: { name: "AuthApiError", status: 429, code: null, message: "rate limited" },
  wrongKey: { name: "AuthApiError", status: 401, code: null, message: "Invalid API key" },
  nonAdminKey: { name: "AuthApiError", status: 401, code: "no_authorization", message: "This endpoint requires a valid Bearer token" },
  htmlNotFound: { name: "AuthUnknownError", status: null, code: null, message: "Unexpected token '<'" },
  // A 404 that is NOT "user not found" (wrong base URL / proxy) must never be read as "already deleted".
  otherNotFound: { name: "AuthApiError", status: 404, code: null, message: "Not Found" },
};

type Item = string;
interface Opts {
  user?: { id: string; deleted_at: string | null } | null;
  authError?: object | null;
  getUserThrows?: boolean;
  history?: Record<string, { count?: number; error?: { message: string } }>;
  items?: () => Item[];
  listError?: boolean;
  disconnect?: Record<string, unknown>;
  deleteErrors?: Record<string, boolean>;
  authDeleteError?: boolean;
}

/** Records reads, Plaid removals and every mutation on ONE ordered timeline, so a test can prove ordering. */
function fakeAdmin(o: Opts = {}) {
  const events: string[] = [];
  const admin = {
    auth: {
      admin: {
        getUserById: vi.fn(async () => {
          events.push("auth:get");
          if (o.getUserThrows) throw new Error("@supabase/auth-js: Expected parameter to be UUID but is not");
          if (o.authError) return { data: { user: null }, error: o.authError };
          return { data: { user: o.user === undefined ? { id: "u1", deleted_at: null } : o.user }, error: null };
        }),
        deleteUser: vi.fn(async (_id: string, soft: boolean) => {
          events.push(soft ? "auth:softDelete" : "auth:hardDelete");
          return { error: o.authDeleteError ? { message: "auth delete failed" } : null };
        }),
        updateUserById: vi.fn(async () => {
          events.push("auth:ban");
          return { error: null };
        }),
      },
    },
    from(table: string) {
      return {
        select: () => ({
          eq: async () => {
            if (HISTORY_TABLES.includes(table)) {
              events.push(`read:${table}`);
              const h = o.history?.[table];
              return { error: h?.error ?? null, count: h?.count ?? 0 };
            }
            if (table === "plaid_items") {
              events.push("list:plaid_items");
              if (o.listError) return { data: null, error: { message: "list failed" } };
              return { data: (o.items?.() ?? []).map((item_id) => ({ item_id })), error: null };
            }
            throw new Error(`unexpected select on ${table}`);
          },
        }),
        delete: () => ({
          eq: async () => {
            events.push(`delete:${table}`);
            return { error: o.deleteErrors?.[table] ? { message: `delete ${table} failed` } : null };
          },
        }),
      };
    },
  };
  disconnectPlaidItem.mockImplementation(async (_c: unknown, args: { itemId: string }) => {
    events.push(`disconnect:${args.itemId}`);
    return o.disconnect?.[args.itemId] ?? { ok: true, purged: false };
  });
  return { admin: admin as never, events, raw: admin };
}

const isDestructive = (e: string) => e.startsWith("disconnect:") || e.startsWith("delete:") || e.startsWith("auth:hard") || e.startsWith("auth:soft") || e === "auth:ban";
const destructive = (events: string[]) => events.filter(isDestructive);

beforeEach(() => {
  // Block body on purpose: an arrow that RETURNS the mock would be run by Vitest as a teardown callback.
  disconnectPlaidItem.mockReset();
});

describe("deleteAccount — B2: what a failed Auth lookup means", () => {
  it("a genuinely absent user is idempotent success (the ONLY error that is), and nothing is touched", async () => {
    const { admin, events } = fakeAdmin({ authError: AUTH.notFound });

    expect(await deleteAccount(admin, "u1")).toEqual({ ok: true, alreadyDeleted: true, path: "already-deleted" });
    expect(destructive(events)).toEqual([]);
  });

  it("also accepts the older 404 'User not found' shape that carries no error code", async () => {
    const { admin } = fakeAdmin({ authError: AUTH.notFoundNoCode });

    expect(await deleteAccount(admin, "u1")).toEqual({ ok: true, alreadyDeleted: true, path: "already-deleted" });
  });

  it.each(Object.entries(AUTH).filter(([k]) => k !== "notFound" && k !== "notFoundNoCode"))(
    "REGRESSION — %s is NOT reported as 'already deleted': it fails, and nothing is disconnected or deleted",
    async (_name, authError) => {
      const { admin, events } = fakeAdmin({ authError });

      const result = await deleteAccount(admin, "u1");

      expect(result.ok).toBe(false); // was: { ok: true, alreadyDeleted: true } — the user was told it worked
      expect(destructive(events)).toEqual([]);
      expect(disconnectPlaidItem).not.toHaveBeenCalled();
    },
  );

  it("fails (rather than assuming success) when the lookup returns neither an error nor a user", async () => {
    const { admin, events } = fakeAdmin({ user: null });

    expect((await deleteAccount(admin, "u1")).ok).toBe(false);
    expect(destructive(events)).toEqual([]);
  });

  it("returns a failure instead of throwing when the lookup itself throws (malformed id)", async () => {
    const { admin, events } = fakeAdmin({ getUserThrows: true });

    const result = await deleteAccount(admin, "not-a-uuid");

    expect(result.ok).toBe(false);
    expect(destructive(events)).toEqual([]);
  });

  it("treats an already-anonymized user (deleted_at set) as done, without touching the ledger or Plaid", async () => {
    const { admin, events } = fakeAdmin({ user: { id: "u1", deleted_at: "2026-09-19T00:00:00Z" } });

    expect(await deleteAccount(admin, "u1")).toEqual({ ok: true, alreadyDeleted: true, path: "already-deleted" });
    expect(events).toEqual(["auth:get"]);
  });
});

describe("deleteAccount — no destructive operation may follow a failed prerequisite", () => {
  it("does not touch Plaid or delete anything when the monetization-history check fails (it is read BEFORE Plaid)", async () => {
    const { admin, events } = fakeAdmin({ items: () => ["item-1"], history: { payments: { error: { message: "db down" } } } });

    const result = await deleteAccount(admin, "u1");

    expect(result.ok).toBe(false);
    expect(disconnectPlaidItem).not.toHaveBeenCalled();
    expect(destructive(events)).toEqual([]);
  });

  it("does not touch Plaid or delete anything when the Plaid item list cannot be read", async () => {
    const { admin, events } = fakeAdmin({ listError: true });

    expect((await deleteAccount(admin, "u1")).ok).toBe(false);
    expect(destructive(events)).toEqual([]);
  });

  it("performs every read-only prerequisite before the first destructive step", async () => {
    const { admin, events } = fakeAdmin({ items: () => ["item-1"] });

    await deleteAccount(admin, "u1");

    const firstDestructive = events.findIndex(isDestructive);
    const lastRead = Math.max(...events.map((e, i) => (e.startsWith("read:") || e.startsWith("list:") || e === "auth:get" ? i : -1)));
    expect(firstDestructive).toBeGreaterThan(lastRead);
  });

  it("stops at the first Plaid failure: no later item is attempted, and nothing at the auth/data layer is deleted", async () => {
    const { admin, events } = fakeAdmin({
      items: () => ["item-1", "item-2", "item-3"],
      disconnect: { "item-2": { ok: false, status: 500, error: "could not remove bank connection" } },
    });

    const result = await deleteAccount(admin, "u1");

    expect(result.ok).toBe(false);
    expect(destructive(events)).toEqual(["disconnect:item-1", "disconnect:item-2"]); // item-3 never attempted; no auth/table deletes
  });

  it("stops at a Plaid failure on the anonymize path too (no cascade deletes, no soft delete, no ban)", async () => {
    const { admin, events } = fakeAdmin({
      items: () => ["item-1"],
      history: { subscriptions: { count: 1 } },
      disconnect: { "item-1": { ok: false, status: 500, error: "x" } },
    });

    expect((await deleteAccount(admin, "u1")).ok).toBe(false);
    expect(destructive(events)).toEqual(["disconnect:item-1"]);
  });

  it("asks Plaid removal to be STRICT, scoped to this user and item, on the admin client", async () => {
    const { admin } = fakeAdmin({ items: () => ["item-1"] });

    await deleteAccount(admin, "u1");

    expect(disconnectPlaidItem).toHaveBeenCalledWith(admin, { userId: "u1", itemId: "item-1", purge: false, strict: true });
  });

  it("does not delete the auth user when Plaid succeeded but the item list was stale: an unknown item (404) is skipped, not fatal", async () => {
    const { admin, events } = fakeAdmin({
      items: () => ["item-1"],
      disconnect: { "item-1": { ok: false, status: 404, error: "unknown item" } },
    });

    expect(await deleteAccount(admin, "u1")).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
    expect(events.at(-1)).toBe("auth:hardDelete");
  });

  it("is retry-safe: after a Plaid failure the same call succeeds once Plaid recovers, resuming with the remaining items", async () => {
    let remaining = ["item-1", "item-2"];
    const { admin, events } = fakeAdmin({
      items: () => remaining,
      disconnect: { "item-2": { ok: false, status: 500, error: "x" } },
    });

    expect((await deleteAccount(admin, "u1")).ok).toBe(false);
    expect(destructive(events)).toEqual(["disconnect:item-1", "disconnect:item-2"]);

    remaining = ["item-2"]; // item-1's local row is gone; item-2's was preserved for the retry
    disconnectPlaidItem.mockImplementation(async (_c: unknown, args: { itemId: string }) => {
      events.push(`disconnect:${args.itemId}`);
      return { ok: true, purged: false };
    });

    expect(await deleteAccount(admin, "u1")).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
    expect(destructive(events).slice(2)).toEqual(["disconnect:item-2", "auth:hardDelete"]);
  });
});

describe("deleteAccount — the two lifecycle paths", () => {
  it("Path A (no monetization history): removes every Plaid item, then a single hard delete cascades the rest", async () => {
    const { admin, events } = fakeAdmin({ items: () => ["item-1", "item-2"] });

    expect(await deleteAccount(admin, "u1")).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
    expect(destructive(events)).toEqual(["disconnect:item-1", "disconnect:item-2", "auth:hardDelete"]);
  });

  it("Path B (has monetization history): removes Plaid, deletes owned tables in FK-safe order, then de-identifies and bans LAST", async () => {
    const { admin, events } = fakeAdmin({ items: () => ["item-1"], history: { redemptions: { count: 2 } } });

    expect(await deleteAccount(admin, "u1")).toEqual({ ok: true, alreadyDeleted: false, path: "anonymize" });
    expect(destructive(events)).toEqual([
      "disconnect:item-1",
      "delete:transactions", // before accounts: transactions.account_id is RESTRICT
      "delete:recurring_series",
      "delete:savings_contributions",
      "delete:savings_goals",
      "delete:budgets",
      "delete:plaid_merchant_rules",
      "delete:categories",
      "delete:accounts",
      "delete:profiles",
      "auth:softDelete",
      "auth:ban",
    ]);
  });

  it("Path B: a failed owned-table delete stops before the auth user is touched", async () => {
    const { admin, events } = fakeAdmin({ history: { payments: { count: 1 } }, deleteErrors: { budgets: true } });

    expect((await deleteAccount(admin, "u1")).ok).toBe(false);
    expect(destructive(events).some((e) => e.startsWith("auth:"))).toBe(false);
  });

  it("Path A: an auth-layer delete failure is reported as a failure, never as success", async () => {
    const { admin } = fakeAdmin({ authDeleteError: true });

    expect((await deleteAccount(admin, "u1")).ok).toBe(false);
  });

  it("running it again after either path completed is a safe no-op", async () => {
    const afterA = fakeAdmin({ authError: AUTH.notFound });
    const afterB = fakeAdmin({ user: { id: "u1", deleted_at: "2026-09-19T00:00:00Z" } });

    expect((await deleteAccount(afterA.admin, "u1")).ok).toBe(true);
    expect((await deleteAccount(afterB.admin, "u1")).ok).toBe(true);
    expect(destructive(afterA.events)).toEqual([]);
    expect(destructive(afterB.events)).toEqual([]);
  });
});

/**
 * `hasMonetizationHistory` decides which lifecycle path runs. On PRODUCTION the four monetization
 * tables (migration 0017) do not exist yet, and the function currently returns `false` there only
 * because postgrest-js turns an empty-body 404 on a HEAD request into "204, no error" (verified
 * against the production schema). These tests use the REAL supabase-js client against a stubbed
 * fetch so that dependency is pinned: if a supabase-js upgrade changes it, deletion would start
 * failing on production, and THIS test — not a customer — finds out.
 */
describe("hasMonetizationHistory — behaviour pinned against the real supabase-js client", () => {
  const client = (respond: (url: string, init?: RequestInit) => Response) =>
    createClient("https://example.supabase.co", "sb_secret_test", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input, init) => respond(String(input), init) },
    });

  it("is false when the tables do not exist yet (production before migration 0017): an empty-body 404", async () => {
    const missing = client(() => new Response(null, { status: 404 }));

    expect(await hasMonetizationHistory(missing, "u1")).toBe(false);
  });

  it("is true when a table reports a row for this user", async () => {
    const hasRow = client((url) => new Response(null, { status: 200, headers: { "content-range": url.includes("/subscriptions") ? "*/1" : "*/0" } }));

    expect(await hasMonetizationHistory(hasRow, "u1")).toBe(true);
  });

  it("is false when every table reports zero rows", async () => {
    const none = client(() => new Response(null, { status: 200, headers: { "content-range": "*/0" } }));

    expect(await hasMonetizationHistory(none, "u1")).toBe(false);
  });

  it("FAILS (throws) on a server error rather than guessing 'no history' — that guess would pick the wrong lifecycle path", async () => {
    const broken = client(() => new Response(JSON.stringify({ message: "boom", code: "XX000" }), { status: 500, headers: { "content-type": "application/json" } }));

    await expect(hasMonetizationHistory(broken, "u1")).rejects.toThrow(/monetization-history check failed/);
  });
});
