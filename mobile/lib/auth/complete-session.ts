import type { EmailOtpType } from "@supabase/supabase-js";
import { problemFromAuthError, type AuthLinkProblem } from "./auth-errors";
import { parseAuthCallbackUrl } from "./parse-callback-url";

export type CompleteSessionResult = { ok: true } | { ok: false; problem: AuthLinkProblem };

type AuthErrorLike = { code?: string; message: string; name?: string; status?: number } | null;

/** The two supabase-js calls a sign-in return needs (injected, so this is unit-tested without a device). */
export type SessionAuth = {
  exchangeCodeForSession(code: string): Promise<{ error: AuthErrorLike }>;
  verifyOtp(args: { type: EmailOtpType; token_hash: string }): Promise<{ error: AuthErrorLike }>;
};

/**
 * Turns a sign-in return URL into a session: a PKCE `code` is exchanged, a
 * `token_hash` verified. Every failure comes back as a problem the sign-in
 * screen explains with a way forward (auth-errors.ts), never Supabase's text.
 */
export async function completeSession(url: string, auth: SessionAuth): Promise<CompleteSessionResult> {
  const parsed = parseAuthCallbackUrl(url);
  if (parsed.kind === "error") return { ok: false, problem: parsed.problem };
  try {
    const { error } =
      parsed.kind === "code"
        ? await auth.exchangeCodeForSession(parsed.code)
        : await auth.verifyOtp({ type: parsed.type, token_hash: parsed.tokenHash });
    return error ? { ok: false, problem: problemFromAuthError(error) } : { ok: true };
  } catch (err) {
    return { ok: false, problem: problemFromAuthError(err as { message: string; name?: string }) };
  }
}
