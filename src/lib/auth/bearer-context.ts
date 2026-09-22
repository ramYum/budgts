/**
 * Authenticated + RLS-scoped data access for Bearer-token (mobile) callers.
 *
 * `getRequestUser` proves WHO the caller is (a round-trip to Supabase Auth that
 * verifies the token's signature/expiry). This adds the second half: a
 * Supabase client that carries that same token, so PostgREST evaluates
 * `auth.uid()` from the caller's own JWT and Row-Level Security scopes every
 * read to that user. Nothing here bypasses RLS: it uses the public publishable
 * key, never `SUPABASE_SECRET_KEY`, and the user id is only ever the one Auth
 * verified — never anything the client sent.
 *
 * Bearer-only by design. Unlike `getRequestUser`, there is no cookie-session
 * fallback: an endpoint that calls this cannot be reached by accident (or by
 * cross-site cookie) without an explicit Authorization header.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { bearerToken, getRequestUser } from "@/lib/auth/get-request-user";

export type BearerContext = { user: User; supabase: SupabaseClient };

export async function getBearerContext(request: Request): Promise<BearerContext | null> {
  const token = bearerToken(request);
  if (!token) return null;

  // Verified user — the only identity ever used downstream.
  const user = await getRequestUser(request);
  if (!user) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );

  return { user, supabase };
}
