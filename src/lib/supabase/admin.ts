import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client — bypasses RLS entirely. Reserved for the
 * small set of backend operations that are inherently privileged (account
 * deletion's `auth.admin.*` calls and the cross-user cleanup that goes with
 * them). Never constructed with a user's session, never exposed to a client.
 *
 * Imported directly by tests/integration/account-deletion.test.ts — see
 * vitest.integration.config.mts's `server-only` alias for how that's made to
 * work without removing this guard.
 */
export function adminSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error("adminSupabase() needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY");
  }
  cached = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  return cached;
}
