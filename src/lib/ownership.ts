/**
 * Ownership of client-supplied ids that point at ANOTHER table, and the account-deletion lock behind a write that matched
 * nothing. One implementation for every command (web Server Actions and `/api/mobile/*` alike).
 *
 * Why it exists: Row-Level Security scopes each row by its own `user_id`, and the `own ...` policies check only that.
 * Foreign keys are checked by Postgres WITHOUT RLS, so a row the caller owns can still reference another user's account,
 * category or goal (`transactions.account_id`, `budgets.category_id`, `savings_contributions.goal_id`,
 * `plaid_merchant_rules.category_id`, `plaid_accounts.account_id`, ...). Until the database enforces it (proposal:
 * docs/security.md → "Still open"), every command confirms each referenced id is VISIBLE through the caller's own RLS
 * client before it writes: another user's row is invisible, so it reads exactly like an unknown id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { accountWritesLocked } from "@/lib/account/write-lock";
import type { Locked } from "@/lib/command-result";

export type ReferencedTable = "accounts" | "categories" | "savings_goals";

export type Visibility = { ok: true } | { ok: false; error: "missing" } | { ok: false; error: "failed"; message: string };

/**
 * `ok` when every non-null id is a row of `table` the caller can see; `missing` when any is not (another user's, or
 * none at all). Null / undefined ids mean "no reference" and pass. Nothing is written either way.
 */
export async function referencesVisible(
  supabase: Pick<SupabaseClient, "from">,
  table: ReferencedTable,
  ids: readonly (string | null | undefined)[],
): Promise<Visibility> {
  const wanted = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (wanted.length === 0) return { ok: true };
  const { data, error } = await supabase.from(table).select("id").in("id", wanted).limit(wanted.length);
  if (error) return { ok: false, error: "failed", message: error.message };
  const seen = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  return wanted.every((id) => seen.has(id)) ? { ok: true } : { ok: false, error: "missing" };
}

/**
 * Why an update or delete of the caller's own row matched nothing: once an account deletion has taken the lock
 * (migration 0021), the database's write guard makes every write match zero rows, which would otherwise read as "that no
 * longer exists". `locked` then, so the user is told changes are paused rather than that their data vanished.
 */
export async function missingOrLocked(supabase: Pick<SupabaseClient, "rpc">): Promise<{ ok: false; error: "missing" | "locked" }> {
  return lockedOr(supabase, { ok: false, error: "missing" });
}

/**
 * Any other refused write: the guard's RESTRICTIVE policies make an insert fail row-level security and an update or
 * delete match nothing. Asked only after a write was refused, so the happy path pays nothing: `locked` while a deletion
 * holds the lock (never the database's own error text, never "no longer exists"), otherwise the caller's own outcome.
 */
export async function lockedOr<T>(supabase: Pick<SupabaseClient, "rpc">, otherwise: T): Promise<Locked | T> {
  return (await accountWritesLocked(supabase)) ? { ok: false, error: "locked" } : otherwise;
}

/** The web's wording for `locked` (brand voice; the app shows its own copy for the `account_locked` code). */
export const LOCKED_MESSAGE = "Your account is being deleted, so changes are paused.";
