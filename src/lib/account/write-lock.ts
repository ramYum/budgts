/**
 * Whether a started account deletion has locked the account (migration 0021): while it has, every write the user makes is
 * refused by the database, and an edit refused that way fails silently (Postgres just matches no rows), so every screen
 * must say so. Asked through the guard's own function (`account_accepts_writes()`, callable by the signed-in user), so the
 * answer and the guard can never disagree. Shared by the web `<DeletionBanner>` and the native `GET /api/mobile/status`.
 *
 * `true` only when the guard positively says writes are refused; a read error is `false` (the web banner's behaviour:
 * no banner rather than a false alarm).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function accountWritesLocked(supabase: Pick<SupabaseClient, "rpc">): Promise<boolean> {
  const { data, error } = await supabase.rpc("account_accepts_writes");
  return !error && data === false;
}
