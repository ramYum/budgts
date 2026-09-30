/**
 * What went wrong with a sign-in, in words a person can act on. Supabase's own
 * error text ("Email link is invalid or has expired", "PKCE code verifier not
 * found in storage…") never reaches the screen: each problem maps to a fixed
 * message, and every message says what to do next. Pure, unit-tested.
 */

export type AuthLinkProblem =
  /** the link was used already, or sat too long */
  | "expired"
  /** the link belongs to a sign-in started elsewhere (another phone, a reinstall, the web) */
  | "other_device"
  /** the user said no at the provider (Google's consent screen) */
  | "denied"
  /** the link is damaged or incomplete */
  | "invalid"
  /** a link the app never asks for (a token_hash or implicit-flow link): refused, parse-callback-url.ts */
  | "not_this_app"
  /** the phone couldn't reach the server */
  | "network"
  /** a signed-in re-sign-in came back as a different account: refused and signed out (lib/auth/reauth-guard.ts) */
  | "other_account";

export const LINK_PROBLEM_MESSAGE: Record<AuthLinkProblem, string> = {
  expired: "That sign-in link has expired or was already used. Send yourself a new one below.",
  other_device:
    "That link belongs to a sign-in started somewhere else. Send a new link from this phone, then open it here.",
  denied: "Sign-in was cancelled. You can try again whenever you're ready.",
  invalid: "That sign-in link didn't work. Send yourself a new one below.",
  not_this_app: "This sign-in link can't be used here. Send yourself a new one below and open it on this phone.",
  network: "Couldn't reach Budgts. Check your connection and try again.",
  other_account: "That sign-in was for a different account, so nothing was deleted and you've been signed out. Sign in again with the account you want to delete.",
};

type ErrorLike = { code?: string | null; message?: string | null; status?: number | null; name?: string | null };

/** Supabase's error codes and the redirect's `error_code` (the fragment of a failed link). */
export function problemFromCode(code: string | null | undefined, fallback: AuthLinkProblem = "invalid"): AuthLinkProblem {
  switch (code) {
    case "otp_expired":
    case "otp_disabled":
      return "expired";
    case "flow_state_not_found":
    case "flow_state_expired":
    case "bad_code_verifier":
    case "pkce_code_verifier_not_found":
      return "other_device";
    case "access_denied":
      return "denied";
    default:
      return fallback;
  }
}

/** A failed exchange/verify from supabase-js, as a problem. */
export function problemFromAuthError(error: ErrorLike): AuthLinkProblem {
  if (error.name === "AuthRetryableFetchError" || /network request failed|failed to fetch/i.test(error.message ?? "")) {
    return "network";
  }
  if (error.name === "AuthPKCECodeVerifierMissingError" || /code verifier/i.test(error.message ?? "")) {
    return "other_device";
  }
  if (/expired|invalid.*token|already.*used/i.test(error.message ?? "")) return problemFromCode(error.code, "expired");
  return problemFromCode(error.code);
}

export type SendLinkFailure = { message: string; retryAfterSeconds: number | null };

/** Why a sign-in email didn't go out, and when it may be asked for again. */
export function describeSendLinkError(error: ErrorLike): SendLinkFailure {
  if (error.name === "AuthRetryableFetchError" || /network request failed|failed to fetch/i.test(error.message ?? "")) {
    return { message: LINK_PROBLEM_MESSAGE.network, retryAfterSeconds: null };
  }
  const wait = /after (\d+) seconds?/i.exec(error.message ?? "");
  if (wait) {
    const seconds = Number(wait[1]);
    return { message: `For your security, wait ${seconds} seconds before asking for another link.`, retryAfterSeconds: seconds };
  }
  if (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
    return {
      message: "Too many sign-in emails were sent just now. Wait a few minutes, then try again, or continue with Google.",
      retryAfterSeconds: null,
    };
  }
  if (error.code === "email_address_invalid" || error.code === "validation_failed") {
    return { message: "Enter a valid email address.", retryAfterSeconds: null };
  }
  return { message: "Couldn't send the sign-in link. Try again in a moment.", retryAfterSeconds: null };
}
