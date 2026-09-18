import { supabase } from "../supabase/client";
import { parseAuthCallbackUrl } from "./parse-callback-url";

export type CompleteSessionResult = { ok: true } | { ok: false; error: string };

/**
 * Finishes sign-in from the `budgts://auth/callback` deep link — the mobile
 * equivalent of `src/app/auth/callback/route.ts`. Handles both the OAuth/PKCE
 * `code` shape and the magic-link `token_hash`+`type` shape.
 */
export async function completeSessionFromUrl(url: string): Promise<CompleteSessionResult> {
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
