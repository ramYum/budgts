import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { sessionUserFromClaims, type SessionUser } from "./claims";

/** Supabase client for Server Components, Server Actions and Route Handlers. */
export async function createClient() {
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
