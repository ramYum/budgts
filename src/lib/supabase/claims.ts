import type { SupabaseClient } from "@supabase/supabase-js";

export interface SessionUser {
  id: string;
  email: string | undefined;
}

/**
 * The signed-in user from the session's verified JWT claims, or null.
 *
 * `getClaims()` verifies the access token's signature locally against the
 * project's cached JWKS (asymmetric signing keys) instead of a network
 * `getUser()` round-trip, and refreshes an expired session first. It returns
 * an error for a bad signature or expired token, but a structurally malformed
 * token (e.g. a corrupted cookie) makes it throw — treated as signed out so the
 * request is redirected to /sign-in rather than failing with a 500.
 */
export async function sessionUserFromClaims(
  auth: Pick<SupabaseClient["auth"], "getClaims">,
): Promise<SessionUser | null> {
  try {
    const { data } = await auth.getClaims();
    const claims = data?.claims;
    if (!claims?.sub) return null;
    return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
  } catch {
    return null;
  }
}
