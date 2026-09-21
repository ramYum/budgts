/**
 * Account deletion — server-side orchestration only. No UI, no transport
 * (Route Handler/Server Action) concerns live here, so the same function can
 * eventually be called from any authenticated entry point (web today, native
 * mobile later — docs/specs/2026-09-17-mobile-app-launch-design.md §6/§12.2).
 *
 * Design authority: docs/specs/2026-09-19-account-deletion-design.md. Two
 * paths, branching on whether the user has any monetization-ledger history
 * (redemptions/subscriptions/payments/revenue_allocations): the ledger's
 * `ON DELETE RESTRICT` to `auth.users` makes a hard delete impossible for such
 * a user. The check itself is in SQL and treats a ledger table that does not
 * exist yet (production before the ledger migration) as "no history" — see
 * `deletion-store.ts`. This file never touches the ledger tables or their rows.
 *
 * THE LOCK. `markDeleting` writes a row in `account_deletions` that makes every
 * user-originated INSERT/UPDATE/DELETE fail through RESTRICTIVE RLS policies
 * (migration 0019; deleting a bank connection stays allowed, migration 0020),
 * whatever the user's JWT says. Revoking sessions is not enough: an access
 * token stays valid until `exp`, and on Path B the auth.users row is kept, so
 * no FK would refuse a stale token's write. Reads keep working, sign-in keeps
 * working, and the refresh sessions are deliberately NOT revoked when the lock
 * is taken — the user must still be able to call this endpoint again if an
 * attempt fails. They are revoked at completion (Path A: the user is gone;
 * Path B: the soft delete). The lock is taken AFTER the first Plaid removal
 * pass: a bank Plaid cannot remove must leave the account fully usable so the
 * user can disconnect it themselves and retry. A failure after the lock leaves
 * a read-only account that a retry finishes; `DeleteAccountResult.locked`
 * tells the caller so.
 *
 * Path A (no monetization history): hard-delete `auth.users` — every
 * `ON DELETE CASCADE` table (profiles, accounts, categories, transactions,
 * budgets, savings_goals, savings_contributions, plaid_items, plaid_accounts,
 * plaid_merchant_rules, recurring_series, account_deletions) is removed by
 * Postgres in the same operation.
 *
 * Path B (has monetization history): `auth.users` cannot be deleted, so it is
 * de-identified in place (Supabase's `deleteUser(id, true)` "soft delete" —
 * verified empirically against this project's own staging database: it scrubs
 * email/phone/metadata/identity data, revokes every active session, and leaves
 * the row's `id` resolvable, which is exactly what the RESTRICT-protected
 * tables need) and permanently banned (defense in depth against any sign-in
 * path not independently verified). The user's owned data is removed FIRST, in
 * ONE database transaction (`store.deleteOwnedData`): all of it or none, in a
 * fixed order, verified empty before it commits, retried only when Postgres
 * picked it as a deadlock victim. "Success" is only reported after a final
 * sweep confirms no owned row survives.
 *
 * Server-only (see `import "server-only"` below). Imported directly by
 * tests/integration/account-deletion*.test.ts, which is why
 * vitest.integration.config.mts aliases `server-only` to its own `empty.js`.
 *
 * Ordering: (1) every READ-ONLY prerequisite — the Auth lookup, the
 * monetization-history check, the Plaid item list — runs before anything is
 * changed, so a failed prerequisite can never follow a destructive step.
 * (2) Plaid removal is STRICT: a local Plaid row (the only copy of the
 * encrypted access token) is deleted only after Plaid confirmed removal or
 * answered "already removed"; any other Plaid failure stops here with that row
 * intact and the account fully usable, so a retry can still finish the job and
 * no live bank connection is ever orphaned. (3) The lock, then a second Plaid
 * pass for anything connected in the window. (4) The data/auth-layer steps. A
 * failure anywhere after (3) leaves the account read-only and retryable.
 *
 * Only the genuine "this user does not exist" answer from Auth is idempotent
 * success. A transient, rate-limit, credential or unrecognised Auth failure is a
 * FAILURE: reporting it as "already deleted" would tell the user their account
 * was deleted when it was not.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { disconnectPlaidItem } from "@/server/plaid/disconnect";
import { createDeletionStore, pgErrorCode, type DeletionStore } from "./deletion-store";

// Matches the Supabase SDK's own documented example for a functionally
// permanent ban (`GoTrueAdminApi.updateUserById` doc comment, verified
// against the pinned @supabase/auth-js version in node_modules).
const PERMANENT_BAN_DURATION = "876000h";

export type DeleteAccountResult =
  | { ok: true; alreadyDeleted: true; path: "already-deleted" }
  | { ok: true; alreadyDeleted: false; path: "hard-delete" | "anonymize" }
  /** `locked`: the account is now read-only (the lock was taken) and a retry will finish the deletion. */
  | { ok: false; error: string; locked: boolean };

/** The Plaid Item ids this user has. A read-only prerequisite: it runs before anything is changed. */
async function listPlaidItemIds(admin: SupabaseClient, userId: string): Promise<string[]> {
  const { data: items, error } = await admin
    .from("plaid_items")
    .select("item_id")
    .eq("user_id", userId);
  if (error) throw new Error(`listing plaid_items failed: ${error.message}`);
  return (items ?? []).map((row: { item_id: string }) => row.item_id);
}

/** Removes every Plaid Item at Plaid, then locally — STRICTLY: it stops at the first
 * item Plaid could not confirm as removed (or already removed), leaving that item's
 * local row intact so the whole operation can be retried. Reuses the existing
 * disconnect implementation in its fail-closed mode rather than duplicating it. */
async function removePlaidItems(admin: SupabaseClient, userId: string, itemIds: string[]): Promise<void> {
  for (const itemId of itemIds) {
    // Every itemId here was just selected scoped to this exact userId, so
    // calling disconnectPlaidItem with the admin (RLS-bypassing) client is
    // safe — the ownership check that normally comes from RLS is instead
    // guaranteed by this query's own `.eq("user_id", userId)` filter.
    const result = await disconnectPlaidItem(admin, { userId, itemId, purge: false, strict: true });
    // 404 = the local row vanished between the list and now (a concurrent disconnect): nothing left to do.
    if (!result.ok && result.status !== 404) {
      throw new Error(`removing Plaid item ${itemId} failed: ${result.error}`);
    }
  }
}

/** True only for Supabase Auth's "this user does not exist" answer (measured: 404, code
 * `user_not_found`). Every other failure — 5xx, network, rate limit, bad key, an HTML 404 from
 * a wrong base URL, a 404 that is not "user not found" — is NOT "already deleted". */
function isAuthUserNotFound(err: { status?: number | null; code?: string | null; message?: string }): boolean {
  if (err.code === "user_not_found") return true;
  return err.status === 404 && /^user not found$/i.test((err.message ?? "").trim());
}

/**
 * True only for the answer GoTrue gives when its OWN delete transaction fails in Postgres: 500 with
 * "Database error deleting user" (measured on staging; supabase-js labels every 5xx
 * `AuthRetryableFetchError`, so the name says nothing — status and message are the signature).
 *
 * Path A's delete is one atomic statement whose FK cascades take row locks in physical scan order. A
 * writer still in flight for this user (a sync applying updates, a transfer-pairing pass) can hold
 * rows in the opposite order, and Postgres then aborts the delete as a deadlock victim (40P01) —
 * reproduced in tests/integration/account-deletion-concurrency.test.ts. GoTrue cannot say WHICH
 * database error it was, so this deliberately matches nothing broader than that exact answer: a rate
 * limit, a gateway error, a bad key or a network failure are not this and are never retried.
 */
function isAuthDatabaseError(err: { status?: number | null; message?: string }): boolean {
  return err.status === 500 && /^database error deleting user$/i.test((err.message ?? "").trim());
}

/** Attempts at the hard delete, including the first. A lock conflict clears as soon as the other writer commits. */
const MAX_HARD_DELETE_ATTEMPTS = 3;

/**
 * Path A's last step. The delete is atomic and idempotent, so re-running it after "Database error
 * deleting user" cannot leave anything half-done; and it is the ONLY thing re-run — the Plaid
 * removal that precedes it is irreversible and is never repeated.
 */
async function hardDeleteAuthUser(admin: SupabaseClient, userId: string) {
  for (let attempt = 1; ; attempt++) {
    const { error } = await admin.auth.admin.deleteUser(userId, false);
    if (!error || attempt >= MAX_HARD_DELETE_ATTEMPTS || !isAuthDatabaseError(error)) return { error, attempts: attempt };
    console.warn("[account] hard delete: Auth reported a database error (a lock conflict); retrying", { attempt });
    await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** (attempt - 1) + Math.random() * 100));
  }
}

/**
 * Path B's tail, after the owned data is gone and the auth user is de-identified: make sure the permanent ban
 * landed, prove no owned row survives (deleting again if a server-side writer added one), and record completion.
 * Idempotent, and also the resume point when an earlier attempt stopped between these steps.
 * Returns an error message, or null when everything is verified.
 */
async function finishAnonymization(
  admin: SupabaseClient,
  store: DeletionStore,
  userId: string,
  { banNeeded }: { banNeeded: boolean },
): Promise<string | null> {
  if (banNeeded) {
    const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: PERMANENT_BAN_DURATION });
    if (error) return `post-deletion ban failed: ${error.message}`;
  }
  let left = await store.countOwnedRows(userId);
  if (left > 0) {
    // Something server-side (a sync, a scan) wrote for this user after the transaction. Sweep it, once.
    await store.deleteOwnedData(userId);
    left = await store.countOwnedRows(userId);
  }
  if (left > 0) return `${left} owned rows remain after deletion`;
  try {
    await store.markDeleted(userId);
  } catch (e) {
    // Cosmetic: the lock row already blocks writes as 'deleting'. Never fail a completed deletion over it.
    console.warn("[account] could not record completion of deletion:", e instanceof Error ? e.name : "non-error value");
  }
  return null;
}

/**
 * Deletes (or, if monetization history exists, de-identifies) the given
 * user's account. `userId` must come from a verified session — this function
 * trusts its caller completely and performs no authentication of its own.
 * Idempotent: calling it again after a completed deletion is a safe no-op, and
 * calling it again after a failure resumes where that attempt stopped.
 */
export async function deleteAccount(
  admin: SupabaseClient,
  userId: string,
  store?: DeletionStore,
): Promise<DeleteAccountResult> {
  let locked = false;
  const fail = (error: string): DeleteAccountResult => ({ ok: false, error, locked });
  try {
    const db = store ?? createDeletionStore();
    const { data: existing, error: getErr } = await admin.auth.admin.getUserById(userId);
    if (getErr) {
      // No such auth user — never existed, or Path A already completed: idempotent success.
      if (isAuthUserNotFound(getErr)) return { ok: true, alreadyDeleted: true, path: "already-deleted" };
      // Anything else (5xx, network, rate limit, bad key, unrecognised) means we do NOT know.
      // Never report it as success. Name/status only: the message is not needed and not logged.
      return fail(`auth lookup failed (${getErr.name ?? "error"}, status ${getErr.status ?? "none"})`);
    }
    if (!existing?.user) return fail("auth lookup returned neither an error nor a user");
    if (existing.user.deleted_at) {
      // Path B's auth step already ran. Resume its tail rather than assuming it finished: an earlier attempt
      // may have stopped before the ban, or before the sweep proved nothing owned is left.
      locked = true;
      const problem = await finishAnonymization(admin, db, userId, { banNeeded: !existing.user.banned_until });
      if (problem) return fail(problem);
      return { ok: true, alreadyDeleted: true, path: "already-deleted" };
    }

    // Every read-only prerequisite first: a failure here must find nothing changed yet.
    const hasHistory = await db.hasMonetizationHistory(userId);
    const plaidItemIds = await listPlaidItemIds(admin, userId);

    // Plaid removal comes BEFORE the lock. A bank Plaid cannot remove must leave the account fully usable, so the
    // user can disconnect it themselves and retry — locking first would strand them behind their own lock.
    await removePlaidItems(admin, userId, plaidItemIds);

    // From here the account is read-only for the user's own (possibly stale) tokens...
    await db.markDeleting(userId);
    locked = true;

    // ...and any bank connected in the window before the lock took effect is a live Item the first pass never saw.
    // (Once locked, the link-token/exchange routes refuse and the guard blocks the insert, so nothing new can appear.)
    const lateItemIds = await listPlaidItemIds(admin, userId);
    if (lateItemIds.length > 0) await removePlaidItems(admin, userId, lateItemIds);

    if (!hasHistory) {
      // Path A: hard-deleting auth.users cascades every remaining table (and the lock row) in one operation.
      const { error, attempts } = await hardDeleteAuthUser(admin, userId);
      if (error) {
        // After a retry, "no such user" means an earlier attempt committed although its answer never
        // reached us: the account IS deleted, which is exactly what was asked for.
        if (attempts > 1 && isAuthUserNotFound(error)) return { ok: true, alreadyDeleted: false, path: "hard-delete" };
        return fail(`hard delete failed: ${error.message}`);
      }
      return { ok: true, alreadyDeleted: false, path: "hard-delete" };
    }

    // Path B: all owned data in one transaction, then de-identify what must stay.
    await db.deleteOwnedData(userId);

    const { error: softErr } = await admin.auth.admin.deleteUser(userId, true);
    if (softErr) return fail(`soft delete failed: ${softErr.message}`);

    const problem = await finishAnonymization(admin, db, userId, { banNeeded: true });
    if (problem) return fail(problem);
    return { ok: true, alreadyDeleted: false, path: "anonymize" };
  } catch (e) {
    return fail(describeError(e));
  }
}

/**
 * What goes in a failure result (and from there into the server log). A database error is reported by its
 * SQLSTATE only: drizzle's own wrapper embeds the SQL text AND its parameters — the user id — in its message.
 */
function describeError(e: unknown): string {
  const code = pgErrorCode(e);
  if (code) return `database error (${code})`;
  const message = e instanceof Error ? e.message : "account deletion failed";
  return /^failed query/i.test(message) ? "database error" : message;
}
