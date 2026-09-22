/**
 * The dual-auth boundary for Route Handlers that must serve BOTH the web (cookie session) and the native app (Bearer
 * token) from the same endpoint, without cloning it — `/api/plaid/{link-token,exchange,item}` (mobile-only-transition
 * spec §4A/§5, matching the existing precedent in `/api/account/delete`). A Bearer header takes priority; when present,
 * the returned Supabase client carries the caller's own JWT so RLS scopes every query, exactly like `getBearerContext`
 * for `/api/mobile/*`. With no Bearer header, this falls back to the ordinary cookie session and its cookie-based
 * client — today's web behaviour, unchanged.
 */
import { createClient as createSupabaseClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createClient, getSessionUser } from "@/lib/supabase/server";

export type RequestContext = { user: User; supabase: SupabaseClient };

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export async function getRequestContext(request: Request): Promise<RequestContext | null> {
  const token = bearerToken(request);

  if (token) {
    const anon = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await anon.auth.getUser(token);
    if (error || !data.user) return null;

    const bearerClient = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return { user: data.user, supabase: bearerClient };
  }

  const user = await getSessionUser();
  if (!user) return null;
  return { user, supabase: await createClient() };
}
