import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

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

export interface SessionUser {
  id: string;
  email: string | undefined;
}

/**
 * The authenticated user for this request, or null.
 *
 * Reads the verified JWT claims (signature checked locally against the cached
 * JWKS) instead of `auth.getUser()`, which is a network round-trip to the
 * Supabase auth server on every call. Row access is still enforced by RLS on
 * the same token, and mutations (server actions) still use `getUser()`.
 * `cache()` scopes one verification per request instead of one per caller.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
});
