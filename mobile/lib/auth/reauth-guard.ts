import type { AuthLinkProblem } from "./auth-errors";
import { isStamped, persist, restore } from "./persisted";

/**
 * A signed-in re-sign-in must come back as the same account (the deletion screen's "Confirm it's you": the email link
 * or Google in place). Google can hand back a different Google account, so, for the hour a re-sign-in can take, a
 * SIGNED_IN for anyone else is refused: the app never shows that session (lib/auth/auth-context.tsx), signs this phone
 * out, and sign-in says why. Never a silent switch, never a deletion flow continued as the other account.
 *
 * Every path goes through here, whichever finishes the exchange (the callback screen, Google in place, Android's
 * double return), because supabase-js announces every new session with SIGNED_IN. supabase-js stores that session
 * before it announces it, so the expectation is kept in secure storage too (lib/auth/persisted.ts): if the process dies
 * in between, or Android kills the app while Google's Custom Tab is open, the next launch refuses the stored session
 * before any screen sees it (`startupVerdict`). No timers.
 */
const TTL_MS = 60 * 60 * 1000;
const KEY = "budgts.reauth-expected";

let expected: { userId: string; at: number } | null = null;
let refused: { userId: string; problem: AuthLinkProblem } | null = null;
let pendingProblem: AuthLinkProblem | null = null;

/** A re-sign-in starts: only `userId` may sign in until it's done, signed out, or an hour has passed. Resolves once stored. */
export async function expectReauthAs(userId: string, now: number = Date.now()): Promise<void> {
  expected = { userId, at: now };
  await persist(KEY, expected);
}

function stopExpecting(): void {
  expected = null;
  void persist(KEY, null);
}

function refuse(userId: string): "reject" {
  refused = { userId, problem: "other_account" };
  pendingProblem = "other_account";
  // In memory only: the stored expectation stays until the sign-out lands (SIGNED_OUT), so a process that dies first
  // refuses this session again on its next launch.
  expected = null;
  return "reject";
}

/**
 * An accepted sign-in: any earlier refusal is over (R1). The refused account may sign in on purpose later (an email
 * link, Android's Google return); the callback must then go on, and sign-in must not show a stale reason. Not on
 * SIGNED_OUT: the callback still needs the refusal after the local sign-out that follows it.
 */
function accepted(): "accept" {
  refused = null;
  pendingProblem = null;
  return "accept";
}

/** The auth listener's verdict on one event: "reject" means never show this session and sign this phone out. */
export function reauthVerdict(event: string, userId: string | null, now: number = Date.now()): "accept" | "reject" {
  if (event === "SIGNED_OUT") {
    stopExpecting();
    return "accept";
  }
  if (!userId) return "accept";
  // The refused session, refreshed while its sign-out is still pending: never shown either.
  if (event !== "SIGNED_IN") return refused?.userId === userId ? "reject" : "accept";
  if (expected && now - expected.at > TTL_MS) stopExpecting();
  if (!expected) return accepted();
  if (userId === expected.userId) {
    stopExpecting(); // the re-sign-in is done (G4)
    return accepted();
  }
  return refuse(userId);
}

/**
 * At launch, before the stored session reaches any screen: a re-sign-in a killed process left unfinished. Within its
 * hour, a stored session for anyone else is refused; the same account resumes being expected.
 */
export async function startupVerdict(sessionUserId: string | null, now: number = Date.now()): Promise<"accept" | "reject"> {
  const v = await restore(KEY);
  if (!isStamped(v, ["userId"] as const)) {
    if (v !== null) await persist(KEY, null);
    return "accept";
  }
  if (now - v.at > TTL_MS) {
    await persist(KEY, null);
    return "accept";
  }
  if (sessionUserId && sessionUserId !== v.userId) return refuse(sessionUserId);
  expected = { userId: v.userId, at: v.at };
  return "accept";
}

/** The sign-out after a refusal failed (G2): the refused session may still be stored. Sign-in says so. */
export function signOutFailed(): void {
  if (refused) refused = { ...refused, problem: "sign_out_failed" };
  pendingProblem = "sign_out_failed";
}

/** Why this user's session was refused, or null (the callback sends a refused user to sign-in with it). */
export function refusalOf(userId: string | null | undefined): AuthLinkProblem | null {
  return userId && refused?.userId === userId ? refused.problem : null;
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
  refused = null;
  pendingProblem = null;
}
