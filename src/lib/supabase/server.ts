import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { sessionUserFromClaims, type SessionUser } from "./claims";

/**
 * Server wall-clock (ms) when this request's render first opened a Supabase
 * client — i.e. before any of its queries ran. <RealtimeRefresh> hands it to
 * the client listener, which skips realtime events that committed at or
 * before it (the page already shows them). Stamping any later (e.g. when
 * <RealtimeRefresh> itself renders, after layouts and pages have queried in
 * parallel) would silently drop a change committed in between.
 *
 * `cache()` scopes it to one server render. Outside a render (a server
 * action's own body) cache() does not memoize, so the page re-rendered in an
 * action's response is stamped after the action's writes committed and the
 * realtime echo of the user's own edit is skipped.
 */
export const renderStartedAt = cache((): number => Date.now());

/** Supabase client for Server Components, Server Actions and Route Handlers. */
export async function createClient() {
  renderStartedAt();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Safe to ignore — proxy.ts refreshes the auth cookie.
          }
        },
      },
    },
  );
}

export type { SessionUser };

/**
 * The authenticated user for this request, or null.
 *
 * Reads the verified JWT claims (signature checked locally against the cached
 * JWKS) instead of `auth.getUser()`, which is a network round-trip to the
 * Supabase auth server on every call. Row access is still enforced by RLS on
 * the same token. Trade-off: a session revoked server-side (sign-out
 * elsewhere) stays usable until its access token expires — most server
 * actions and API routes also authenticate through this; only the onboarding,
 * tour and transaction actions call `getUser()`.
 * `cache()` scopes one verification per request instead of one per caller.
 */
export const getSessionUser = cache(
  async (): Promise<SessionUser | null> => sessionUserFromClaims((await createClient()).auth),
);
