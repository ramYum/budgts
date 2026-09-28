/**
 * The dual-auth boundary for Route Handlers that serve BOTH the web (cookie
 * session) and the native app (Bearer token) from one endpoint, without
 * cloning it (`/api/plaid/{link-token,exchange,item}`). A Bearer header takes
 * priority and never falls back to a cookie; its client carries the caller's
 * own JWT so RLS scopes every query, exactly like `getBearerContext`. With no
 * Bearer header this is the ordinary cookie session and its cookie client:
 * today's web behaviour, unchanged.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { bearerClient } from "@/lib/auth/bearer-context";
import { bearerToken, verifyAccessToken } from "@/lib/auth/get-request-user";
import type { SessionUser } from "@/lib/supabase/claims";
import { createClient, getSessionUser } from "@/lib/supabase/server";

export type RequestContext = { user: SessionUser; supabase: SupabaseClient };

export async function getRequestContext(request: Request): Promise<RequestContext | null> {
  const token = bearerToken(request);
  if (token) {
    const user = await verifyAccessToken(token);
    return user ? { user, supabase: bearerClient(token) } : null;
  }

  const user = await getSessionUser();
  if (!user) return null;
  return { user, supabase: await createClient() };
}
