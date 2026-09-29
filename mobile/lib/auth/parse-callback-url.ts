import type { EmailOtpType } from "@supabase/supabase-js";
import { problemFromCode, type AuthLinkProblem } from "./auth-errors";

/**
 * What `budgts://auth/callback` can carry, mirroring the two shapes the web
 * callback (`src/app/auth/callback/route.ts`) handles: a PKCE `code` (OAuth,
 * and the magic link, since the app's client is PKCE) or a `token_hash`+`type`
 * pair (magic-link verification).
 *
 * A failed link carries its error in the URL FRAGMENT, not the query: Supabase
 * redirects an expired or used link to `…/callback#error=access_denied&
 * error_code=otp_expired&error_description=…` (verified against staging). The
 * web page that hands a link to the app (/app/auth/callback) forwards both
 * parts, so both are read here.
 */
export type ParsedAuthCallback =
  | { kind: "code"; code: string }
  | { kind: "otp"; tokenHash: string; type: EmailOtpType }
  | { kind: "error"; problem: AuthLinkProblem };

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

  const code = params.get("code");
  if (code) return { kind: "code", code };

  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  if (tokenHash && type) return { kind: "otp", tokenHash, type };

  return { kind: "error", problem: "invalid" };
}

/** Whether a URL is the app's sign-in return (`budgts://auth/callback`, any query or fragment). */
export function isAuthCallbackUrl(url: string | null | undefined): url is string {
  return !!url && /^budgts:\/\/\/?auth\/callback(?:[?#]|$)/i.test(url);
}
