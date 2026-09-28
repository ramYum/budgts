import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const disconnectPlaidItem = vi.fn();
vi.mock("@/server/plaid/disconnect", () => ({ disconnectPlaidItem: (...a: unknown[]) => disconnectPlaidItem(...a) }));

import { deleteAccount } from "./delete-account";
import type { DeletionStore } from "./deletion-store";

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
  // What GoTrue answers when its own delete transaction fails in Postgres (measured on staging when the cascade
  // lost a deadlock, 40P01): supabase-js classes it AuthRetryableFetchError, like EVERY 5xx, so only the
  // status + message identify it. The delete is one atomic transaction, so nothing was deleted.
  authDatabaseError: { name: "AuthRetryableFetchError", status: 500, code: undefined, message: "Database error deleting user" },
};

const BANNED = "2126-01-01T00:00:00Z";
const USER_ID = "user-id-that-must-not-leak";

type Item = string;
interface Opts {
  user?: { id: string; deleted_at: string | null; banned_until?: string | null } | null;
  authError?: object | null;
  getUserThrows?: boolean;
  items?: () => Item[];
  listError?: boolean;
  disconnect?: Record<string, unknown>;
  authDeleteError?: boolean;
  /** Scripted answers to successive HARD `auth.admin.deleteUser` calls (null = success); then falls back to `authDeleteError`. */
  hardDeleteResults?: (object | null)[];
  softDeleteError?: boolean;
  banError?: boolean;
}
interface StoreOpts {
  /** true = has ledger history (Path B). An Error makes the check itself fail. */
  history?: boolean | Error;
  markDeletingError?: boolean;
  markDeletedError?: boolean;
  /** Answers to successive `deleteOwnedData` calls: an Error rejects, anything else resolves. */
  deleteOwned?: Array<Error | null>;
  /** Answers to successive `countOwnedRows` calls; 0 once exhausted. */
  counts?: number[];
}

/** Records reads, Plaid removals, store calls and every mutation on ONE ordered timeline, so a test can prove ordering. */
function setup(o: Opts = {}, so: StoreOpts = {}) {
  const events: string[] = [];
  const removed = new Set<string>();
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
          if (soft) return { error: o.softDeleteError ? { message: "soft delete failed" } : null };
          if (o.hardDeleteResults?.length) return { error: o.hardDeleteResults.shift() ?? null };
          return { error: o.authDeleteError ? { message: "auth delete failed" } : null };
        }),
        updateUserById: vi.fn(async () => {
          events.push("auth:ban");
          return { error: o.banError ? { message: "ban failed" } : null };
        }),
      },
    },
    from(table: string) {
      return {
        select: () => ({
          eq: async () => {
            if (table === "plaid_items") {
              events.push("list:plaid_items");
              if (o.listError) return { data: null, error: { message: "list failed" } };
              // A removed Item's local row is gone, so a later list no longer shows it.
              return { data: (o.items?.() ?? []).filter((i) => !removed.has(i)).map((item_id) => ({ item_id })), error: null };
            }
            throw new Error(`unexpected select on ${table}`);
          },
        }),
      };
    },
  };
  disconnectPlaidItem.mockImplementation(async (_c: unknown, args: { itemId: string }) => {
    events.push(`disconnect:${args.itemId}`);
    const result = (o.disconnect?.[args.itemId] ?? { ok: true, purged: false }) as { ok: boolean; status?: number };
    if (result.ok || result.status === 404) removed.add(args.itemId);
    return result;
  });

  let deleteCalls = 0;
  let countCalls = 0;
  const store: DeletionStore = {
    hasMonetizationHistory: vi.fn(async () => {
      events.push("store:history");
      if (so.history instanceof Error) throw so.history;
      return so.history ?? false;
    }),
    markDeleting: vi.fn(async () => {
      events.push("store:markDeleting");
      if (so.markDeletingError) throw new Error("db down");
    }),
    markDeleted: vi.fn(async () => {
      events.push("store:markDeleted");
      if (so.markDeletedError) throw new Error("db down");
    }),
    deleteOwnedData: vi.fn(async () => {
      events.push("store:deleteOwned");
      const answer = so.deleteOwned?.[deleteCalls++] ?? null;
      if (answer) throw answer;
      return { deleted: {} };
    }),
    countOwnedRows: vi.fn(async () => {
      events.push("store:count");
      return so.counts?.[countCalls++] ?? 0;
    }),
  };
  return { admin: admin as never, store, events, raw: admin, removed };
}

const isDestructive = (e: string) =>
  e.startsWith("disconnect:") || e.startsWith("auth:hard") || e.startsWith("auth:soft") || e === "auth:ban" ||
  e === "store:markDeleting" || e === "store:deleteOwned" || e === "store:markDeleted";
const destructive = (events: string[]) => events.filter(isDestructive);

beforeEach(() => {
  // Block body on purpose: an arrow that RETURNS the mock would be run by Vitest as a teardown callback.
  disconnectPlaidItem.mockReset();
});

describe("deleteAccount — B2: what a failed Auth lookup means", () => {
  it("a genuinely absent user is idempotent success (the ONLY error that is), and nothing is touched", async () => {
    const { admin, store, events } = setup({ authError: AUTH.notFound });

    expect(await deleteAccount(admin, "u1", store)).toEqual({ ok: true, alreadyDeleted: true, path: "already-deleted" });
    expect(destructive(events)).toEqual([]);
  });

  it("also accepts the older 404 'User not found' shape that carries no error code", async () => {
    const { admin, store } = setup({ authError: AUTH.notFoundNoCode });

    expect(await deleteAccount(admin, "u1", store)).toEqual({ ok: true, alreadyDeleted: true, path: "already-deleted" });
  });

  it.each(Object.entries(AUTH).filter(([k]) => k !== "notFound" && k !== "notFoundNoCode"))(
    "REGRESSION — %s is NOT reported as 'already deleted': it fails, and nothing is locked, disconnected or deleted",
    async (_name, authError) => {
      const { admin, store, events } = setup({ authError });

      const result = await deleteAccount(admin, "u1", store);

      expect(result.ok).toBe(false); // was: { ok: true, alreadyDeleted: true } — the user was told it worked
      expect(result.ok === false && result.locked).toBe(false);
      expect(destructive(events)).toEqual([]);
      expect(disconnectPlaidItem).not.toHaveBeenCalled();
    },
  );

  it("fails (rather than assuming success) when the lookup returns neither an error nor a user", async () => {
    const { admin, store, events } = setup({ user: null });

    expect((await deleteAccount(admin, "u1", store)).ok).toBe(false);
    expect(destructive(events)).toEqual([]);
  });

  it("returns a failure instead of throwing when the lookup itself throws (malformed id)", async () => {
    const { admin, store, events } = setup({ getUserThrows: true });

    const result = await deleteAccount(admin, "not-a-uuid", store);

    expect(result.ok).toBe(false);
    expect(destructive(events)).toEqual([]);
  });
});

describe("deleteAccount — no destructive operation may follow a failed prerequisite", () => {
  it("takes no lock, touches no Plaid and deletes nothing when the monetization-history check fails (it is read BEFORE)", async () => {
    const { admin, store, events } = setup({ items: () => ["item-1"] }, { history: new Error("db down") });

    const result = await deleteAccount(admin, "u1", store);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.locked).toBe(false);
    expect(disconnectPlaidItem).not.toHaveBeenCalled();
    expect(destructive(events)).toEqual([]);
  });

  it("takes no lock and deletes nothing when the Plaid item list cannot be read", async () => {
    const { admin, store, events } = setup({ listError: true });

    expect((await deleteAccount(admin, "u1", store)).ok).toBe(false);
    expect(destructive(events)).toEqual([]);
  });

  it("performs every read-only prerequisite before the first destructive step (the first Plaid removal)", async () => {
    const { admin, store, events } = setup({ items: () => ["item-1"] });

    await deleteAccount(admin, "u1", store);

    const firstDestructive = events.findIndex(isDestructive);
    const lastRead = Math.max(...events.map((e, i) => (e === "store:history" || (e.startsWith("list:") && i < firstDestructive) || e === "auth:get" ? i : -1)));
    expect(events[firstDestructive]).toBe("disconnect:item-1");
    expect(firstDestructive).toBeGreaterThan(lastRead);
  });

  it("removes Plaid BEFORE it locks: the irreversible external step is never taken behind a lock the user cannot escape", async () => {
    const { admin, store, events } = setup({ items: () => ["item-1"] });

    await deleteAccount(admin, "u1", store);

    expect(destructive(events)).toEqual(["disconnect:item-1", "store:markDeleting", "auth:hardDelete"]);
  });

  it("if the lock itself cannot be taken, the account is untouched (Plaid is already disconnected, which a retry does not repeat)", async () => {
    const { admin, store, events } = setup({ items: () => ["item-1"] }, { markDeletingError: true });

    const result = await deleteAccount(admin, "u1", store);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.locked).toBe(false);
    expect(destructive(events)).toEqual(["disconnect:item-1", "store:markDeleting"]); // nothing after the failed lock
  });

  it("stops at the first Plaid failure: no later item is attempted, nothing is deleted, and the account stays fully usable (NOT locked)", async () => {
    const { admin, store, events } = setup({
      items: () => ["item-1", "item-2", "item-3"],
      disconnect: { "item-2": { ok: false, status: 500, error: "could not remove bank connection" } },
    });

    const result = await deleteAccount(admin, "u1", store);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.locked).toBe(false); // the user can still disconnect the bank themselves and retry
    expect(destructive(events)).toEqual(["disconnect:item-1", "disconnect:item-2"]); // item-3 never attempted; no lock
  });

  it("stops at a Plaid failure on the anonymize path too (no lock, no data delete, no soft delete, no ban)", async () => {
    const { admin, store, events } = setup(
      { items: () => ["item-1"], disconnect: { "item-1": { ok: false, status: 500, error: "x" } } },
      { history: true },
    );

    expect((await deleteAccount(admin, "u1", store)).ok).toBe(false);
    expect(destructive(events)).toEqual(["disconnect:item-1"]);
  });

  it("removes a bank connected in the window before the lock took effect (a second Plaid pass after locking)", async () => {
    let listCalls = 0;
    const { admin, store, events } = setup({ items: () => (++listCalls === 1 ? ["item-1"] : ["item-1", "item-late"]) });

    expect(await deleteAccount(admin, "u1", store)).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
    expect(destructive(events)).toEqual(["disconnect:item-1", "store:markDeleting", "disconnect:item-late", "auth:hardDelete"]);
  });

  it("a Plaid failure on a late-connected bank is reported LOCKED: the lock is already on and a retry finishes it", async () => {
    let listCalls = 0;
    const { admin, store } = setup({
      items: () => (++listCalls === 1 ? [] : ["item-late"]),
      disconnect: { "item-late": { ok: false, status: 500, error: "x" } },
    });

    const result = await deleteAccount(admin, "u1", store);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.locked).toBe(true);
  });

  it("asks Plaid removal to be STRICT, scoped to this user and item, on the admin client", async () => {
    const { admin, store } = setup({ items: () => ["item-1"] });

    await deleteAccount(admin, "u1", store);

    expect(disconnectPlaidItem).toHaveBeenCalledWith(admin, { userId: "u1", itemId: "item-1", purge: false, strict: true });
  });

  it("does not delete the auth user when Plaid succeeded but the item list was stale: an unknown item (404) is skipped, not fatal", async () => {
    const { admin, store, events } = setup({
      items: () => ["item-1"],
      disconnect: { "item-1": { ok: false, status: 404, error: "unknown item" } },
    });

    expect(await deleteAccount(admin, "u1", store)).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
    expect(events.at(-1)).toBe("auth:hardDelete");
  });

  it("is retry-safe: after a Plaid failure the same call succeeds once Plaid recovers, resuming with the remaining items", async () => {
    let remaining = ["item-1", "item-2"];
    const { admin, store, events, removed } = setup({
      items: () => remaining,
      disconnect: { "item-2": { ok: false, status: 500, error: "x" } },
    });

    expect((await deleteAccount(admin, "u1", store)).ok).toBe(false);
    expect(destructive(events)).toEqual(["disconnect:item-1", "disconnect:item-2"]);

    remaining = ["item-2"]; // item-1's local row is gone; item-2's was preserved for the retry
    removed.clear();
    disconnectPlaidItem.mockImplementation(async (_c: unknown, args: { itemId: string }) => {
      events.push(`disconnect:${args.itemId}`);
      removed.add(args.itemId);
      return { ok: true, purged: false };
    });

    expect(await deleteAccount(admin, "u1", store)).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
    expect(destructive(events).slice(2)).toEqual(["disconnect:item-2", "store:markDeleting", "auth:hardDelete"]);
  });
});

describe("deleteAccount — the two lifecycle paths", () => {
  it("Path A (no monetization history): remove every Plaid item, lock, then a single hard delete cascades the rest", async () => {
    const { admin, store, events } = setup({ items: () => ["item-1", "item-2"] });

    expect(await deleteAccount(admin, "u1", store)).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
    expect(destructive(events)).toEqual(["disconnect:item-1", "disconnect:item-2", "store:markDeleting", "auth:hardDelete"]);
    expect(store.deleteOwnedData).not.toHaveBeenCalled(); // the cascade does it
  });

  it("Path B (has monetization history): Plaid, lock, ONE atomic data delete, then de-identify and ban, then verify and record", async () => {
    const { admin, store, events } = setup({ items: () => ["item-1"] }, { history: true });

    expect(await deleteAccount(admin, "u1", store)).toEqual({ ok: true, alreadyDeleted: false, path: "anonymize" });
    expect(destructive(events)).toEqual([
      "disconnect:item-1",
      "store:markDeleting",
      "store:deleteOwned", // ONE call: the transaction and its table order live in the store
      "auth:softDelete",
      "auth:ban",
      "store:markDeleted",
    ]);
    expect(events.slice(events.indexOf("auth:ban"))).toEqual(["auth:ban", "store:count", "store:markDeleted"]); // verified BEFORE it is recorded
  });

  it("Path B: a failed atomic delete stops before the auth user is touched, and reports the account locked", async () => {
    const { admin, store, events } = setup({}, { history: true, deleteOwned: [new Error("boom")] });

    const result = await deleteAccount(admin, "u1", store);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.locked).toBe(true);
    expect(destructive(events).some((e) => e.startsWith("auth:"))).toBe(false);
  });

  it("Path B: a failed soft delete is a failure and no ban or completion record follows", async () => {
    const { admin, store, events } = setup({ softDeleteError: true }, { history: true });

    const result = await deleteAccount(admin, "u1", store);

    expect(result).toEqual({ ok: false, error: "soft delete failed: soft delete failed", locked: true });
    expect(events).not.toContain("auth:ban");
    expect(events).not.toContain("store:markDeleted");
  });

  it("Path B: a failed ban is a failure, never success", async () => {
    const { admin, store, events } = setup({ banError: true }, { history: true });

    const result = await deleteAccount(admin, "u1", store);

    expect(result).toEqual({ ok: false, error: "post-deletion ban failed: ban failed", locked: true });
    expect(events).not.toContain("store:markDeleted");
  });

  it("Path A: an auth-layer delete failure is reported as a failure (locked, retryable), never as success", async () => {
    const { admin, store } = setup({ authDeleteError: true });

    expect(await deleteAccount(admin, "u1", store)).toEqual({ ok: false, error: "hard delete failed: auth delete failed", locked: true });
  });

  it("running it again after either path completed is a safe no-op", async () => {
    const afterA = setup({ authError: AUTH.notFound });
    const afterB = setup({ user: { id: "u1", deleted_at: "2026-09-19T00:00:00Z", banned_until: BANNED } });

    expect((await deleteAccount(afterA.admin, "u1", afterA.store)).ok).toBe(true);
    expect((await deleteAccount(afterB.admin, "u1", afterB.store)).ok).toBe(true);
    expect(destructive(afterA.events)).toEqual([]);
    expect(destructive(afterB.events)).toEqual(["store:markDeleted"]); // idempotent bookkeeping only; no Plaid, no auth, no data
    expect(afterB.store.deleteOwnedData).not.toHaveBeenCalled();
  });
});

/**
 * "Success" must mean nothing owned survives. A server-side writer (a sync, a recurring scan) is not stopped by
 * the row-level-security lock, so after the auth user is de-identified Path B counts what is left.
 */
describe("deleteAccount — Path B never reports success while owned rows survive", () => {
  it("sweeps once when a late server-side write is found, then reports success", async () => {
    const { admin, store, events } = setup({}, { history: true, counts: [3, 0] });

    expect(await deleteAccount(admin, "u1", store)).toEqual({ ok: true, alreadyDeleted: false, path: "anonymize" });
    expect(events.filter((e) => e === "store:deleteOwned")).toHaveLength(2); // the transaction, then the sweep
  });

  it("FAILS (never success) when rows are still there after the sweep, and does not record completion", async () => {
    const { admin, store, events } = setup({}, { history: true, counts: [3, 2] });

    const result = await deleteAccount(admin, "u1", store);

    expect(result).toEqual({ ok: false, error: "2 owned rows remain after deletion", locked: true });
    expect(events).not.toContain("store:markDeleted");
  });

  it("a failure to RECORD completion does not fail a deletion that is verifiably complete (the lock already holds)", async () => {
    const { admin, store } = setup({}, { history: true, markDeletedError: true });

    expect(await deleteAccount(admin, "u1", store)).toEqual({ ok: true, alreadyDeleted: false, path: "anonymize" });
  });

  it("RESUMES after an attempt that stopped between the soft delete and the ban: the ban is applied, then it is verified and recorded", async () => {
    const { admin, store, events } = setup({ user: { id: "u1", deleted_at: "2026-09-19T00:00:00Z", banned_until: null } });

    expect(await deleteAccount(admin, "u1", store)).toEqual({ ok: true, alreadyDeleted: true, path: "already-deleted" });
    expect(events).toEqual(["auth:get", "auth:ban", "store:count", "store:markDeleted"]);
  });

  it("RESUMES after an attempt that stopped before the sweep proved the data gone: it deletes again rather than trusting 'deleted_at'", async () => {
    const { admin, store, events } = setup(
      { user: { id: "u1", deleted_at: "2026-09-19T00:00:00Z", banned_until: BANNED } },
      { counts: [4, 0] },
    );

    expect(await deleteAccount(admin, "u1", store)).toEqual({ ok: true, alreadyDeleted: true, path: "already-deleted" });
    expect(events).toContain("store:deleteOwned");
  });

  it("a resume that still finds owned rows is a FAILURE, not 'already deleted'", async () => {
    const { admin, store } = setup(
      { user: { id: "u1", deleted_at: "2026-09-19T00:00:00Z", banned_until: BANNED } },
      { counts: [4, 4] },
    );

    expect(await deleteAccount(admin, "u1", store)).toEqual({ ok: false, error: "4 owned rows remain after deletion", locked: true });
  });
});

describe("deleteAccount — what a failure says (and does not say)", () => {
  it("reports a database error by its SQLSTATE only", async () => {
    const wrapped = Object.assign(new Error("Failed query: delete from x"), { cause: { code: "57014" } });
    const { admin, store } = setup({}, { history: true, deleteOwned: [wrapped] });

    expect(await deleteAccount(admin, USER_ID, store)).toEqual({ ok: false, error: "database error (57014)", locked: true });
  });

  it("never puts drizzle's 'Failed query ... params' text (which embeds the user id) in a result", async () => {
    const leaky = new Error(`Failed query: delete from "public"."accounts" where "user_id" = $1\nparams: ${USER_ID}`);
    const { admin, store } = setup({}, { history: true, deleteOwned: [leaky] });

    const result = await deleteAccount(admin, USER_ID, store);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(USER_ID);
    expect(result.ok === false && result.error).toBe("database error");
  });
});

/**
 * Path A's last step is one GoTrue call that deletes `auth.users` and lets Postgres cascade every owned
 * table inside that single statement. Reproduced on staging (tests/integration/account-deletion-
 * concurrency.test.ts): when a concurrent writer (a sync, a transfer-pairing pass) holds rows in the
 * opposite order to the cascade, Postgres aborts the DELETE as a deadlock victim (40P01) and GoTrue
 * answers 500 "Database error deleting user". The transaction rolled back, so NOTHING was deleted — but the
 * Plaid Items had already been removed, and the user was told their deletion failed.
 *
 * Retrying that one call is safe: it is atomic, idempotent, and the irreversible Plaid step is not repeated.
 * It is deliberately NOT a general retry: only this measured signature qualifies.
 */
describe("deleteAccount — Path A: Auth's own database error (a lock conflict) is retried, narrowly", () => {
  it("retries the hard delete when Auth reports its database error, and then reports success", async () => {
    const { admin, store, raw, events } = setup({ hardDeleteResults: [AUTH.authDatabaseError, null] });

    expect(await deleteAccount(admin, "u1", store)).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
    expect(raw.auth.admin.deleteUser).toHaveBeenCalledTimes(2);
    expect(destructive(events)).toEqual(["store:markDeleting", "auth:hardDelete", "auth:hardDelete"]);
  });

  it("does NOT repeat the irreversible Plaid removal when only the Auth step is retried", async () => {
    const { admin, store, events } = setup({ items: () => ["item-1", "item-2"], hardDeleteResults: [AUTH.authDatabaseError, AUTH.authDatabaseError, null] });

    expect((await deleteAccount(admin, "u1", store)).ok).toBe(true);
    expect(destructive(events)).toEqual(["disconnect:item-1", "disconnect:item-2", "store:markDeleting", "auth:hardDelete", "auth:hardDelete", "auth:hardDelete"]);
    expect(disconnectPlaidItem).toHaveBeenCalledTimes(2);
  });

  it("gives up after a bounded number of attempts and reports a failure, never success", async () => {
    const { admin, store, raw } = setup({ hardDeleteResults: Array(10).fill(AUTH.authDatabaseError) });

    const result = await deleteAccount(admin, "u1", store);

    expect(result).toEqual({ ok: false, error: "hard delete failed: Database error deleting user", locked: true });
    expect(raw.auth.admin.deleteUser).toHaveBeenCalledTimes(3);
  });

  it("treats 'user not found' on a RETRY as done: an earlier attempt may have committed even though its answer was lost", async () => {
    const { admin, store } = setup({ hardDeleteResults: [AUTH.authDatabaseError, AUTH.notFound] });

    expect(await deleteAccount(admin, "u1", store)).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
  });

  it.each([
    ["a 500 from upstream that is not Auth's database error", AUTH.http500],
    ["a 502", AUTH.http502],
    ["a 503", AUTH.http503],
    ["a network failure", AUTH.networkDown],
    ["a rate limit", AUTH.rateLimited],
    ["a wrong or non-admin key", AUTH.wrongKey],
    ["a non-JSON response", AUTH.htmlNotFound],
    ["a 404 that is not 'user not found'", AUTH.otherNotFound],
    ["an error with no status at all", { message: "auth delete failed" }],
    ["the right message with the wrong status", { name: "AuthApiError", status: 400, code: null, message: "Database error deleting user" }],
    // The measured 25,000-row failure before the foreign-key indexes existed: the gateway gave up, nothing committed.
    ["a gateway timeout (504)", { name: "AuthRetryableFetchError", status: 504, code: null, message: "Gateway Timeout" }],
  ])("does not retry %s: one attempt, reported as a failure", async (_label, error) => {
    const { admin, store, raw } = setup({ hardDeleteResults: [error, null] });

    expect((await deleteAccount(admin, "u1", store)).ok).toBe(false);
    expect(raw.auth.admin.deleteUser).toHaveBeenCalledTimes(1);
  });

  it("only a RETRY reads 'user not found' as done: on the first attempt that answer keeps its existing meaning (a failure)", async () => {
    const { admin, store, raw } = setup({ hardDeleteResults: [AUTH.notFound] });

    expect((await deleteAccount(admin, "u1", store)).ok).toBe(false);
    expect(raw.auth.admin.deleteUser).toHaveBeenCalledTimes(1);
  });

  it("does not add the retry to the anonymize path: its soft delete is unchanged", async () => {
    const { admin, store, raw } = setup({}, { history: true });
    raw.auth.admin.deleteUser.mockResolvedValueOnce({ error: AUTH.authDatabaseError });

    expect((await deleteAccount(admin, "u1", store)).ok).toBe(false);
    expect(raw.auth.admin.deleteUser).toHaveBeenCalledTimes(1);
  });

  it("never logs anything identifying while retrying", async () => {
    const logged: unknown[][] = [];
    const spies = (["log", "info", "warn", "error"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args)),
    );
    try {
      const { admin, store } = setup({ hardDeleteResults: [AUTH.authDatabaseError, null] });

      await deleteAccount(admin, USER_ID, store);

      expect(logged.length).toBeGreaterThan(0); // it did log the retry...
      expect(JSON.stringify(logged)).not.toContain(USER_ID); // ...without the user id
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
