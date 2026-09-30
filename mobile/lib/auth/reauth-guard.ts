import type { AuthLinkProblem } from "./auth-errors";

/**
 * A signed-in re-sign-in must come back as the same account (the deletion screen's "Confirm it's you": the email link
 * or Google in place). Google can hand back a different Google account, so, for the hour a re-sign-in can take, a
 * SIGNED_IN for anyone else is refused: the app never shows that session (lib/auth/auth-context.tsx), signs this phone
 * out, and sign-in says why. Never a silent switch, never a deletion flow continued as the other account.
 *
 * Every path goes through here, whichever finishes the exchange (the callback screen, Google in place, Android's
 * double return), because supabase-js announces every new session with SIGNED_IN. Pure module state, no timers.
 */
const TTL_MS = 60 * 60 * 1000;

let expected: { userId: string; at: number } | null = null;
let rejectedUserId: string | null = null;
let pendingProblem: AuthLinkProblem | null = null;

/** A re-sign-in starts: only `userId` may sign in until it's done, signed out, or an hour has passed. */
export function expectReauthAs(userId: string, now: number = Date.now()): void {
  expected = { userId, at: now };
}

/** The auth listener's verdict on one event: "reject" means never show this session and sign this phone out. */
export function reauthVerdict(event: string, userId: string | null, now: number = Date.now()): "accept" | "reject" {
  if (event === "SIGNED_OUT") {
    expected = null;
    return "accept";
  }
  if (event !== "SIGNED_IN" || !userId) return "accept";
  if (expected && now - expected.at > TTL_MS) expected = null;
  if (!expected || userId === expected.userId) return accepted();
  expected = null;
  rejectedUserId = userId;
  pendingProblem = "other_account";
  return "reject";
}

/**
 * An accepted sign-in: any earlier refusal is over (R1). The refused account may sign in on purpose later (an email
 * link, Android's Google return); the callback must then go on, and sign-in must not show a stale reason. Not on
 * SIGNED_OUT: the callback still needs the refusal after the local sign-out that follows it.
 */
function accepted(): "accept" {
  rejectedUserId = null;
  pendingProblem = null;
  return "accept";
}

/** Whether this user's session was refused (the callback screen sends them to sign-in with the reason). */
export function wasRejected(userId: string | null | undefined): boolean {
  return !!userId && userId === rejectedUserId;
}

/** Why the last sign-in was refused, once: sign-in shows it above its form. */
export function takeSignInProblem(): AuthLinkProblem | null {
  const p = pendingProblem;
  pendingProblem = null;
  return p;
}

/** Tests only. */
export function resetReauthGuard(): void {
  expected = null;
  rejectedUserId = null;
  pendingProblem = null;
}
