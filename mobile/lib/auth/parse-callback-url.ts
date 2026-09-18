import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * What `budgts://auth/callback` can carry, mirroring the two shapes the web
 * callback (`src/app/auth/callback/route.ts`) already handles: a PKCE
 * `code` (OAuth, and magic-link when the project's email flow is PKCE), or
 * a `token_hash`+`type` pair (magic-link verification). Same defensive
 * either/or on mobile, since both are real possible shapes for the same
 * "magic link" product feature and this repo doesn't control which one a
 * given Supabase project config produces.
 */
export type ParsedAuthCallback =
  | { kind: "code"; code: string }
  | { kind: "otp"; tokenHash: string; type: EmailOtpType }
  | { kind: "error"; message: string };

/** Pure — no native modules, no I/O. Safe to unit-test without a device. */
export function parseAuthCallbackUrl(url: string): ParsedAuthCallback {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "error", message: "Malformed callback URL" };
  }

  const params = parsed.searchParams;

  const errorDescription = params.get("error_description") ?? params.get("error");
  if (errorDescription) return { kind: "error", message: errorDescription };

  const code = params.get("code");
  if (code) return { kind: "code", code };

  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  if (tokenHash && type) return { kind: "otp", tokenHash, type };

  return { kind: "error", message: "Callback URL had no code or token_hash" };
}
