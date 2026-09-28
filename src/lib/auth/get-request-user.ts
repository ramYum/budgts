/**
 * Authenticates a Route Handler request for either caller: the web app
 * (cookie session, via `getSessionUser()`) or the native app
 * (`Authorization: Bearer <access_token>`, per
 * docs/specs/2026-09-17-mobile-app-launch-design.md §4/§6).
 *
 * The identity always comes from a verified token, never from a
 * client-supplied id. A Bearer token is verified with `getClaims(token)`: the
 * signature is checked locally against the project's cached JWKS (asymmetric
 * signing keys), exactly like the cookie path (`src/lib/supabase/claims.ts`),
 * so a native read pays no network round trip to Supabase Auth. A forged,
 * expired or malformed token yields null. Trade-off (the same one the web
 * accepts): a token whose session was revoked stays valid until it expires;
 * RLS still scopes every read to its user, the deletion write guard refuses
 * writes, and account deletion itself re-checks with the network `getUser()`.
 *
 * Only the public `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is used; this module
 * never touches `SUPABASE_SECRET_KEY`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sessionUserFromClaims, type SessionUser } from "@/lib/supabase/claims";
import { getSessionUser } from "@/lib/supabase/server";

// One verifier client per server instance, created on first use (never at import time), so its JWKS cache is reused
// across requests.
let verifier: SupabaseClient | null = null;

function verifierClient(): SupabaseClient {
  verifier ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return verifier;
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

/** The user a Bearer access token belongs to, or null when it does not verify. */
export async function verifyAccessToken(token: string): Promise<SessionUser | null> {
  const auth = verifierClient().auth;
  return sessionUserFromClaims({ getClaims: () => auth.getClaims(token) });
}

/**
 * The authenticated user for this request, or null. A Bearer header wins and
 * never falls back to a cookie; without one, the cookie session is used.
 * Server Components/Actions have no `Request`, so they keep `getSessionUser()`.
 */
export async function getRequestUser(request: Request): Promise<SessionUser | null> {
  const token = bearerToken(request);
  if (!token) return getSessionUser();
  return verifyAccessToken(token);
}
