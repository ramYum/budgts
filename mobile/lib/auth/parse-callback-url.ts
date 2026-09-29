import { problemFromCode, type AuthLinkProblem } from "./auth-errors";

/**
 * What `budgts://auth/callback` may carry: the PKCE `code` of a sign-in this
 * app started (Google, and the email link, since the app's client is PKCE),
 * or why the link failed.
 *
 * Only PKCE codes (decided 2026-09-29, launch spec §4): a code is useless
 * without the verifier this phone stored when it asked for the link, so a
 * code can't sign the phone in to someone else's account. A `token_hash`
 * link carries no such binding: an attacker's own magic link opened on a
 * signed-out phone would sign it in to the attacker's account (and the bank
 * connected next would feed that account). The app never sends one, so it
 * refuses them with a way forward. The web's own `/auth/callback` still
 * verifies `token_hash` links; that is the web's flow.
 *
 * A failed link carries its error in the URL FRAGMENT, not the query: Supabase
 * redirects an expired or used link to `…/callback#error=access_denied&
 * error_code=otp_expired&error_description=…` (verified against staging). The
 * web page that hands a link to the app (/app/auth/callback) forwards it as
 * parameters, so both are read here.
 */
export type ParsedAuthCallback = { kind: "code"; code: string } | { kind: "error"; problem: AuthLinkProblem };

/** Pure — no native modules, no I/O. Safe to unit-test without a device. */
export function parseAuthCallbackUrl(url: string): ParsedAuthCallback {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "error", problem: "invalid" };
  }

  const params = new URLSearchParams(parsed.search);
  for (const [key, value] of new URLSearchParams(parsed.hash.replace(/^#/, ""))) {
    if (!params.has(key)) params.set(key, value);
  }

  const error = params.get("error_code") ?? params.get("error");
  if (error || params.get("error_description")) return { kind: "error", problem: problemFromCode(error) };

  // Never a session this app didn't start: token_hash links and implicit-flow tokens are refused.
  if (params.has("token_hash") || params.has("access_token") || params.has("refresh_token")) {
    return { kind: "error", problem: "not_this_app" };
  }

  const code = params.get("code");
  if (code) return { kind: "code", code };

  return { kind: "error", problem: "invalid" };
}

/** Whether a URL is the app's sign-in return (`budgts://auth/callback`, any query or fragment). */
export function isAuthCallbackUrl(url: string | null | undefined): url is string {
  return !!url && /^budgts:\/\/\/?auth\/callback(?:[?#]|$)/i.test(url);
}
