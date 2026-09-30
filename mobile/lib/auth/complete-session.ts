import { problemFromAuthError, type AuthLinkProblem } from "./auth-errors";
import { parseAuthCallbackUrl } from "./parse-callback-url";

/** `userId`: who the exchange signed in (from its own answer: the app's session state may not have caught up yet). */
export type CompleteSessionResult = { ok: true; userId?: string } | { ok: false; problem: AuthLinkProblem };

type AuthErrorLike = { code?: string; message: string; name?: string; status?: number } | null;

/** The supabase-js call a sign-in return needs (injected, so this is unit-tested without a device). */
export type SessionAuth = {
  exchangeCodeForSession(code: string): Promise<{ data?: { user?: { id: string } | null } | null; error: AuthErrorLike }>;
};

/**
 * Turns a sign-in return URL into a session: the PKCE `code` of a sign-in
 * this app started is exchanged; anything else is refused (parse-callback-url.ts).
 * Every failure comes back as a problem the sign-in
 * screen explains with a way forward (auth-errors.ts), never Supabase's text.
 */
export async function completeSession(url: string, auth: SessionAuth): Promise<CompleteSessionResult> {
  const parsed = parseAuthCallbackUrl(url);
  if (parsed.kind === "error") return { ok: false, problem: parsed.problem };
  try {
    const { data, error } = await auth.exchangeCodeForSession(parsed.code);
    if (error) return { ok: false, problem: problemFromAuthError(error) };
    const userId = data?.user?.id;
    return userId ? { ok: true, userId } : { ok: true };
  } catch (err) {
    return { ok: false, problem: problemFromAuthError(err as { message: string; name?: string }) };
  }
}
