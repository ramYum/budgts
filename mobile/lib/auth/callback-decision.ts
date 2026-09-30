import type { AuthLinkProblem } from "./auth-errors";
import type { CompleteSessionResult } from "./complete-session";

/**
 * Where `budgts://auth/callback` goes once its code has been tried (app/auth/callback.tsx). The screen is reachable
 * signed in as well as signed out, because a signed-in user's fresh sign-in (Settings → Delete account → "Confirm it's
 * you") returns through it.
 *
 * - Signed out, as before: success goes on (to what the sign-in left, else Home); a failure goes to sign-in with its
 *   problem.
 * - Signed in: success goes on the same way. A failure changes nothing (the session is untouched; only a PKCE code
 *   this app started can be exchanged, parse-callback-url.ts) and says so, with a way back: where the fresh sign-in was
 *   meant to return, else Home. Never a sign-out, never a dead end.
 *
 * - A re-sign-in that came back as a different account (lib/auth/reauth-guard.ts refused it and is signing the phone
 *   out): once signed out, sign-in with the reason. Never on as the other account.
 *
 * `takeReturn` is lib/auth/return-intent.ts `takeReturnAfterSignIn`: one-shot, so call this once per outcome.
 */
export type CallbackDecision =
  /** the exchange hasn't answered, or it succeeded and the session hasn't reached the app yet */
  | { kind: "wait" }
  | { kind: "go"; href: string }
  | { kind: "sign-in"; problem: AuthLinkProblem }
  | { kind: "problem"; problem: AuthLinkProblem; back: string };

export function callbackDecision(
  outcome: CompleteSessionResult | null,
  /** the signed-in user when the answer came, or null */
  userId: string | null,
  takeReturn: (userId: string) => string | null,
  /** reauth-guard.ts `refusalOf`: why this account's session was refused, or null */
  refusal: (userId: string | null | undefined) => AuthLinkProblem | null = () => null,
): CallbackDecision {
  if (!outcome) return { kind: "wait" };
  const refused = outcome.ok ? refusal(outcome.userId) : null;
  if (refused) return userId ? { kind: "wait" } : { kind: "sign-in", problem: refused };
  if (outcome.ok) return userId ? { kind: "go", href: takeReturn(userId) ?? "/" } : { kind: "wait" };
  if (!userId) return { kind: "sign-in", problem: outcome.problem };
  return { kind: "problem", problem: outcome.problem, back: takeReturn(userId) ?? "/" };
}

/** What a signed-in user reads when a sign-in link fails: nothing changed, and why. */
export const SIGNED_IN_LINK_PROBLEM: Record<AuthLinkProblem, string> = {
  expired: "That sign-in link has expired or was already used. Nothing changed, and you're still signed in. Ask for a new one.",
  other_device: "That link belongs to a sign-in started somewhere else. Nothing changed, and you're still signed in.",
  denied: "Sign-in was cancelled. Nothing changed, and you're still signed in.",
  invalid: "That sign-in link didn't work. Nothing changed, and you're still signed in. Ask for a new one.",
  not_this_app: "This sign-in link can't be used here. Nothing changed, and you're still signed in.",
  network: "Couldn't reach Budgts, so the sign-in didn't finish. Nothing changed, and you're still signed in.",
  sign_out_failed: "That sign-in was for a different account, and Budgts couldn't finish signing it out. Nothing was deleted. Close Budgts and open it again to finish, then sign in with the account you want to delete.",
  other_account: "That sign-in was for a different account, so nothing was deleted and you've been signed out. Sign in again with the account you want to delete.",
};
