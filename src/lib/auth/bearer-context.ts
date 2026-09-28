/**
 * Authenticated + RLS-scoped data access for Bearer-token (native app) callers.
 *
 * `verifyAccessToken` proves WHO the caller is (the token's signature and
 * expiry, checked locally against the JWKS). This adds the second half: a
 * Supabase client that carries that same token, so PostgREST evaluates
 * `auth.uid()` from the caller's own JWT and Row-Level Security scopes every
 * query to that user. Nothing here bypasses RLS: it uses the public
 * publishable key, never `SUPABASE_SECRET_KEY`, and the user id is only ever
 * the verified one, never anything the client sent.
 *
 * Bearer-only by design: there is no cookie fallback, so an endpoint that
 * calls this cannot be reached by accident (or by a cross-site cookie)
 * without an explicit Authorization header.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { bearerToken, verifyAccessToken } from "@/lib/auth/get-request-user";
import type { SessionUser } from "@/lib/supabase/claims";

export type BearerContext = { user: SessionUser; supabase: SupabaseClient };

/** A Supabase client acting as the holder of `token` (RLS applies). */
export function bearerClient(token: string): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function getBearerContext(request: Request): Promise<BearerContext | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const user = await verifyAccessToken(token);
  if (!user) return null;

  return { user, supabase: bearerClient(token) };
}
