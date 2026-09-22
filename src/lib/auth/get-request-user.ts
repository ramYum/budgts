/**
 * Authenticates a Route Handler request for either caller: the web app
 * (cookie session, via `getSessionUser()`) or the native mobile client
 * (`Authorization: Bearer <access_token>`, per
 * docs/specs/2026-09-17-mobile-app-launch-design.md §4/§6).
 *
 * The user identity always comes from a verified token/session — never from
 * a client-supplied id. For the Bearer path, `supabase.auth.getUser(jwt)`
 * round-trips to Supabase's own Auth server to verify the token signature
 * and expiry before returning the user it decodes to; a forged or expired
 * token yields an error, not a user. Only the public, client-safe
 * `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is used here — this module never
 * touches `SUPABASE_SECRET_KEY`.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getSessionUser } from "@/lib/supabase/server";

let anonClient: SupabaseClient | null = null;

function getAnonClient(): SupabaseClient {
  if (anonClient) return anonClient;
  anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return anonClient;
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

/**
 * The authenticated user for this request, or null. Route Handlers should
 * use this instead of `getSessionUser()` directly once they need to be
 * mobile-callable — Server Components/Server Actions have no `Request` to
 * read a header from, so they keep using `getSessionUser()` as before.
 */
export async function getRequestUser(request: Request): Promise<User | null> {
  const token = bearerToken(request);
  if (!token) return getSessionUser();

  const { data, error } = await getAnonClient().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
