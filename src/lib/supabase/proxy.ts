import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sessionUserFromClaims } from "./claims";

/**
 * Refreshes the Supabase auth cookie for an incoming request and returns the
 * response carrying any updated Set-Cookie headers, plus the current user.
 * Called from the root `proxy.ts`.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims() — it refreshes
  // the token and a gap here can log users out at random.
  //
  // getClaims() verifies the JWT signature locally against the project's cached
  // JWKS (ES256 signing keys), so a page load doesn't pay a network round-trip
  // to the Supabase auth server the way getUser() does. It still refreshes an
  // expired token. A malformed cookie token reads as signed out (see claims.ts).
  const user = await sessionUserFromClaims(supabase.auth);

  return { response, user };
}
