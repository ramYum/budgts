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
 * Ordering note: every destructive step before the final auth-layer call is
 * naturally idempotent (deleting rows that are already gone is a no-op, and
 * disconnecting an already-disconnected Plaid Item is a defined 404). The
 * auth-layer call (hard delete, or soft-delete+ban) is deliberately LAST, so
 * a failure anywhere earlier leaves the account exactly as it was — still
 * logged in, nothing login-blocking has happened yet — and a retry simply
 * continues where it left off, rather than ever leaving a user locked out of
 * an account that's only half-deleted.
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

/** Disconnects every Plaid Item this user has — best-effort at Plaid itself
 * (mirrors disconnectPlaidItem's own "revoked/expired can't be removed twice
 * but must still disconnect locally" posture), hard-fails only if the local
 * DB cleanup itself errors. Reuses the existing, already-tested disconnect
 * function rather than duplicating its logic (task: "use the existing Plaid
 * disconnect/revocation implementation where appropriate"). */
async function disconnectAllPlaidItems(admin: SupabaseClient, userId: string): Promise<void> {
  const { data: items, error } = await admin
    .from("plaid_items")
    .select("item_id")
    .eq("user_id", userId);
  if (error) throw new Error(`listing plaid_items failed: ${error.message}`);

  for (const { item_id: itemId } of items ?? []) {
    // Every itemId here was just selected scoped to this exact userId, so
    // calling disconnectPlaidItem with the admin (RLS-bypassing) client is
    // safe — the ownership check that normally comes from RLS is instead
    // guaranteed by this query's own `.eq("user_id", userId)` filter.
    const result = await disconnectPlaidItem(admin, { userId, itemId, purge: false });
    if (!result.ok && result.status !== 404) {
      throw new Error(`disconnecting Plaid item ${itemId} failed: ${result.error}`);
    }
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
  const { data: existing, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr || !existing?.user) {
    // No such auth user — either never existed, or Path A already completed.
    return { ok: true, alreadyDeleted: true, path: "already-deleted" };
  }
  if (existing.user.deleted_at) {
    // Path B already completed for this user.
    return { ok: true, alreadyDeleted: true, path: "already-deleted" };
  }

  try {
    await disconnectAllPlaidItems(admin, userId);

    const hasHistory = await hasMonetizationHistory(admin, userId);

    if (!hasHistory) {
      // Path A: nothing else to delete explicitly — hard-deleting auth.users
      // cascades every remaining CASCADE table in one Postgres operation.
      const { error } = await admin.auth.admin.deleteUser(userId, false);
      if (error) return { ok: false, error: `hard delete failed: ${error.message}` };
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
