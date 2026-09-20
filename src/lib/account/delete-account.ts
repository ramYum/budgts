/**
 * Account deletion — server-side orchestration only. No UI, no transport
 * (Route Handler/Server Action) concerns live here, so the same function can
 * eventually be called from any authenticated entry point (web today, native
 * mobile later — docs/specs/2026-09-17-mobile-app-launch-design.md §6/§12.2).
 *
 * Design authority: docs/specs/2026-09-19-account-deletion-design.md. Two
 * paths, branching on whether the user has any monetization-ledger history
 * (redemptions/subscriptions/payments/revenue_allocations), because migration
 * 0017's `ON DELETE RESTRICT` from those tables to `auth.users` makes a hard
 * delete impossible for such a user — see that design doc §2/§7 for the full
 * FK analysis. Never touches migration 0017's schema or its immutable rows.
 *
 * Path A (no monetization history): hard-delete `auth.users` — every
 * `ON DELETE CASCADE` table (profiles, accounts, categories, transactions,
 * budgets, savings_goals, savings_contributions, plaid_items, plaid_accounts,
 * plaid_merchant_rules, recurring_series) is removed by Postgres in the same
 * operation. Nothing else to do.
 *
 * Path B (has monetization history): `auth.users` cannot be deleted, so it is
 * de-identified in place instead (Supabase's `deleteUser(id, true)` "soft
 * delete" — verified empirically against this project's own staging database
 * before this was written: it scrubs email/phone/metadata/identity data,
 * revokes every active session immediately, and leaves the row's `id`
 * resolvable, which is exactly what the RESTRICT-protected tables need).
 * `updateUserById(id, { ban_duration: ... })` is added on top as defense in
 * depth against any future sign-in path this audit didn't independently
 * verify (Google OAuth specifically — see the design doc's Open Engineering
 * Decisions). The CASCADE tables are then deleted explicitly, since nothing
 * cascades from an `auth.users` row that was never actually removed.
 *
 * Server-only (see `import "server-only"` below) — imported directly by
 * tests/integration/account-deletion.test.ts, which is why
 * vitest.integration.config.mts aliases `server-only` to its own `empty.js`
 * rather than this file (or `src/lib/plaid/client.ts`, imported transitively
 * via `disconnectPlaidItem`) going without the guard.
 *
 * Ordering: (1) every READ-ONLY prerequisite — the Auth lookup, the
 * monetization-history check, the Plaid item list — runs before anything is
 * destroyed, so a failed prerequisite can never follow a destructive step.
 * (2) Plaid removal is STRICT: a local Plaid row (the only copy of the encrypted
 * access token) is deleted only after Plaid confirmed removal or answered
 * "already removed"; any other Plaid failure stops here with that row intact,
 * so a retry can still finish the job and no live bank connection is ever
 * orphaned. (3) The auth-layer call (hard delete, or soft-delete+ban) is
 * deliberately LAST. A failure anywhere earlier leaves the account still
 * signed-in and usable, and a retry simply continues where it left off.
 *
 * Only the genuine "this user does not exist" answer from Auth is idempotent
 * success. A transient, rate-limit, credential or unrecognised Auth failure is a
 * FAILURE: reporting it as "already deleted" would tell the user their account
 * was deleted when it was not.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { disconnectPlaidItem } from "@/server/plaid/disconnect";

// Matches the Supabase SDK's own documented example for a functionally
// permanent ban (`GoTrueAdminApi.updateUserById` doc comment, verified
// against the pinned @supabase/auth-js version in node_modules).
const PERMANENT_BAN_DURATION = "876000h";

export type DeleteAccountResult =
  | { ok: true; alreadyDeleted: true; path: "already-deleted" }
  | { ok: true; alreadyDeleted: false; path: "hard-delete" | "anonymize" }
  | { ok: false; error: string };

/**
 * True if this user has any row in a migration-0017 monetization table.
 * Determines which of the two deletion paths applies — see module doc.
 */
export async function hasMonetizationHistory(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const checks = await Promise.all([
    admin.from("redemptions").select("id", { head: true, count: "exact" }).eq("user_id", userId),
    admin.from("subscriptions").select("id", { head: true, count: "exact" }).eq("user_id", userId),
    admin.from("payments").select("id", { head: true, count: "exact" }).eq("user_id", userId),
    admin
      .from("revenue_allocations")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId),
  ]);
  for (const { error, count } of checks) {
    if (error) throw new Error(`monetization-history check failed: ${error.message}`);
    if ((count ?? 0) > 0) return true;
  }
  return false;
}

/** CASCADE-from-auth.users tables not already handled by Plaid disconnect
 * (plaid_items/plaid_accounts), in an order that respects the one internal
 * RESTRICT among them: transactions.account_id -> accounts.id. Everything
 * else here is CASCADE or SET NULL internally, so order is otherwise free. */
async function deleteCascadeOwnedData(admin: SupabaseClient, userId: string): Promise<void> {
  const steps: Array<[table: string, column: string]> = [
    ["transactions", "user_id"],
    ["recurring_series", "user_id"],
    ["savings_contributions", "user_id"],
    ["savings_goals", "user_id"],
    ["budgets", "user_id"],
    ["plaid_merchant_rules", "user_id"],
    ["categories", "user_id"],
    ["accounts", "user_id"],
    ["profiles", "id"],
  ];
  for (const [table, column] of steps) {
    const { error } = await admin.from(table).delete().eq(column, userId);
    if (error) throw new Error(`deleting ${table} failed: ${error.message}`);
  }
}

/** The Plaid Item ids this user has. A read-only prerequisite: it runs before anything is destroyed. */
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
 * Deletes (or, if monetization history exists, de-identifies) the given
 * user's account. `userId` must come from a verified session — this function
 * trusts its caller completely and performs no authentication of its own.
 * Idempotent: calling it again after a completed deletion is a safe no-op.
 */
export async function deleteAccount(
  admin: SupabaseClient,
  userId: string,
): Promise<DeleteAccountResult> {
  try {
    const { data: existing, error: getErr } = await admin.auth.admin.getUserById(userId);
    if (getErr) {
      // No such auth user — never existed, or Path A already completed: idempotent success.
      if (isAuthUserNotFound(getErr)) return { ok: true, alreadyDeleted: true, path: "already-deleted" };
      // Anything else (5xx, network, rate limit, bad key, unrecognised) means we do NOT know.
      // Never report it as success. Name/status only: the message is not needed and not logged.
      return { ok: false, error: `auth lookup failed (${getErr.name ?? "error"}, status ${getErr.status ?? "none"})` };
    }
    if (!existing?.user) return { ok: false, error: "auth lookup returned neither an error nor a user" };
    if (existing.user.deleted_at) {
      // Path B already completed for this user.
      return { ok: true, alreadyDeleted: true, path: "already-deleted" };
    }

    // Every read-only prerequisite first: a failure here must find nothing destroyed yet.
    const hasHistory = await hasMonetizationHistory(admin, userId);
    const plaidItemIds = await listPlaidItemIds(admin, userId);

    await removePlaidItems(admin, userId, plaidItemIds);

    if (!hasHistory) {
      // Path A: nothing else to delete explicitly — hard-deleting auth.users
      // cascades every remaining CASCADE table in one Postgres operation.
      const { error, attempts } = await hardDeleteAuthUser(admin, userId);
      if (error) {
        // After a retry, "no such user" means an earlier attempt committed although its answer never
        // reached us: the account IS deleted, which is exactly what was asked for.
        if (attempts > 1 && isAuthUserNotFound(error)) return { ok: true, alreadyDeleted: false, path: "hard-delete" };
        return { ok: false, error: `hard delete failed: ${error.message}` };
      }
      return { ok: true, alreadyDeleted: false, path: "hard-delete" };
    }

    // Path B: delete everything reachable, then de-identify what must stay.
    await deleteCascadeOwnedData(admin, userId);

    const { error: softErr } = await admin.auth.admin.deleteUser(userId, true);
    if (softErr) return { ok: false, error: `soft delete failed: ${softErr.message}` };

    const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: PERMANENT_BAN_DURATION,
    });
    if (banErr) return { ok: false, error: `post-deletion ban failed: ${banErr.message}` };

    return { ok: true, alreadyDeleted: false, path: "anonymize" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "account deletion failed" };
  }
}
