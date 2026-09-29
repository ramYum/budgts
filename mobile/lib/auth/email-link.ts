import { describeSendLinkError } from "./auth-errors";
import { isPlausibleEmail, normalizeEmail } from "./email";
import { RESEND_AFTER_SECONDS, emailLinkRedirect } from "./sign-in-options";

export type SendLinkResult =
  | { ok: true; email: string }
  | { ok: false; message: string; retryAfterSeconds: number | null; invalidEmail?: true };

type OtpError = { code?: string; message: string; name?: string; status?: number } | null;

export type EmailLinkDeps = {
  /** supabase.auth.signInWithOtp */
  signInWithOtp(args: { email: string; options: { emailRedirectTo: string } }): Promise<{ error: OtpError }>;
  /** EXPO_PUBLIC_API_BASE_URL: the link lands on its hand-off page (sign-in-options.ts emailLinkRedirect) */
  apiBaseUrl: string | undefined;
};

/** A build without its API address can't send a link that works: said plainly, never thrown. */
export const NOT_SET_UP = "Budgts isn't set up correctly on this device. Please update the app.";

/**
 * Sends a sign-in email link. The address is trimmed (Android keyboards add a
 * space after autocomplete) and checked for a plausible shape first, so a
 * typo doesn't cost one of the few emails Supabase allows per hour. Supabase
 * creates the account on first sign-in, as on the web. Failures come back in
 * words (auth-errors.ts), with a wait when Supabase asks for one.
 */
export async function sendEmailLink(rawEmail: string, deps: EmailLinkDeps): Promise<SendLinkResult> {
  const email = normalizeEmail(rawEmail);
  if (!isPlausibleEmail(email)) {
    return { ok: false, message: "Enter a valid email address.", retryAfterSeconds: null, invalidEmail: true };
  }
  let redirectTo: string;
  try {
    redirectTo = emailLinkRedirect(deps.apiBaseUrl);
  } catch {
    return { ok: false, message: NOT_SET_UP, retryAfterSeconds: null };
  }
  try {
    const { error } = await deps.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) return { ok: false, ...describeSendLinkError(error) };
    return { ok: true, email };
  } catch (err) {
    return { ok: false, ...describeSendLinkError(err as { message: string; name?: string }) };
  }
}

/**
 * How long "Send it again" waits after an attempt: the usual pause after a
 * link went out, the server's own wait when Supabase names one, and none
 * after any other failure (the person may retry at once).
 */
export function resendWaitSeconds(result: SendLinkResult): number {
  if (result.ok) return RESEND_AFTER_SECONDS;
  return result.retryAfterSeconds ?? 0;
}
