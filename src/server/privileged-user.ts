import "server-only";
import { createClient as createSupabaseClient, type User } from "@supabase/supabase-js";
import { bearerToken } from "@/lib/auth/get-request-user";
import { createClient } from "@/lib/supabase/server";

/**
 * The caller of a PRIVILEGED write (account deletion), re-checked against Supabase Auth over the network.
 *
 * Read paths verify the token locally (`getClaims`, see get-request-user.ts), which cannot see a session revoked since
 * the token was issued and does not carry `last_sign_in_at`. Deletion needs both: it must refuse a signed-out token,
 * and its step-up check (reauth.ts) reads the user's most recent real sign-in. So this one path pays for
 * `auth.getUser()`; it is allow-listed in tests/unit/performance-guardrails.test.ts for that reason.
 *
 * A Bearer header wins and never falls back to a cookie; without one, the cookie session is used. Only the public
 * publishable key is involved; the identity always comes from Auth, never from the request body.
 */
export async function getPrivilegedUser(request: Request): Promise<User | null> {
  const token = bearerToken(request);
  if (token) {
    const anon = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await anon.auth.getUser(token);
    return error || !data.user ? null : data.user;
  }
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  return user ?? null;
}
