import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * The admin client cannot be built because required server configuration is absent.
 * `missing` holds variable NAMES only — never values — so this error is safe to log
 * server-side. It must never be shown to a client: which secrets exist is internal detail.
 */
export class AdminConfigError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(`admin client not configured: missing ${missing.join(", ")}`);
    this.name = "AdminConfigError";
    this.missing = missing;
  }
}

/** A variable that is unset, empty or only whitespace is not configured. */
const isSet = (value: string | undefined): value is string => typeof value === "string" && value.trim() !== "";

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
  const missing: string[] = [];
  if (!isSet(url)) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!isSet(secret)) missing.push("SUPABASE_SECRET_KEY");
  if (missing.length > 0 || !isSet(url) || !isSet(secret)) throw new AdminConfigError(missing);

  cached = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  return cached;
}
