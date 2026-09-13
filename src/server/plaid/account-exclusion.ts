import type { SupabaseClient } from "@supabase/supabase-js";

export type SetAccountCalculationExclusionOutcome =
  | { outcome: "ok" }
  | { outcome: "not_found" }
  | { outcome: "needs_review_required" };

/**
 * Explicit owner decision to exclude/re-include a Plaid account's data from
 * financial calculations (design: 2026-09-13 Advancial containment). Never
 * called by sync or the anomaly detector — only ever a deliberate owner
 * action, mirroring `transfer_user_set`'s own "only set by explicit user
 * action, never by sync" precedent.
 *
 * Ownership is checked explicitly in this function's own query, not left to
 * RLS alone — `userId` must match the row's `user_id`, so a caller can never
 * affect another user's account regardless of client-supplied state.
 * Excluding (`excluded: true`) additionally requires the account to
 * currently be `needs_review: true`, so an owner can't exclude a healthy
 * account by mistake; re-including (`excluded: false`) has no such
 * requirement — it's the safe, reversible direction. Never touches any
 * transaction row.
 */
export async function setAccountCalculationExclusion(
  supabase: SupabaseClient,
  userId: string,
  plaidAccountRowId: string,
  excluded: boolean,
): Promise<SetAccountCalculationExclusionOutcome> {
  const { data: row, error: readError } = await supabase
    .from("plaid_accounts")
    .select("id, needs_review")
    .eq("id", plaidAccountRowId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!row) return { outcome: "not_found" };

  if (excluded && !row.needs_review) return { outcome: "needs_review_required" };

  const { error: updateError } = await supabase
    .from("plaid_accounts")
    .update({ excluded_from_calculations: excluded })
    .eq("id", plaidAccountRowId)
    .eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);

  return { outcome: "ok" };
}
