import { describeSendLinkError } from "./auth-errors";
import { isPlausibleEmail, normalizeEmail } from "./email";

export type SendLinkResult =
  | { ok: true; email: string }
  | { ok: false; message: string; retryAfterSeconds: number | null; invalidEmail?: true };

type OtpError = { code?: string; message: string; name?: string; status?: number } | null;

export type EmailLinkDeps = {
  /** supabase.auth.signInWithOtp */
  signInWithOtp(args: { email: string; options: { emailRedirectTo: string } }): Promise<{ error: OtpError }>;
  /** where the link lands (sign-in-options.ts emailLinkRedirect) */
  redirectTo: string;
};

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
  try {
    const { error } = await deps.signInWithOtp({ email, options: { emailRedirectTo: deps.redirectTo } });
    if (error) return { ok: false, ...describeSendLinkError(error) };
    return { ok: true, email };
  } catch (err) {
    return { ok: false, ...describeSendLinkError(err as { message: string; name?: string }) };
  }
}
