import { supabase } from "../supabase/client";
import { onceByKey } from "./once-by-key";
import { parseAuthCallbackUrl } from "./parse-callback-url";

export type CompleteSessionResult = { ok: true } | { ok: false; error: string };

async function completeSession(url: string): Promise<CompleteSessionResult> {
  const parsed = parseAuthCallbackUrl(url);

  if (parsed.kind === "error") return { ok: false, error: parsed.message };

  if (parsed.kind === "code") {
    const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase.auth.verifyOtp({
    type: parsed.type,
    token_hash: parsed.tokenHash,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Finishes sign-in from the `budgts://auth/callback` deep link — the mobile
 * equivalent of `src/app/auth/callback/route.ts`. Handles both the OAuth/PKCE
 * `code` shape and the magic-link `token_hash`+`type` shape.
 *
 * Deduplicated per URL: the same single-use link can reach the app both via
 * `openAuthSessionAsync` (Google) and via the intent routed to
 * `app/auth/callback.tsx`; both callers get the one shared result.
 */
export const completeSessionFromUrl = onceByKey(completeSession);
