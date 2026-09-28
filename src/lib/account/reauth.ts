import "server-only";
import type { User } from "@supabase/supabase-js";

/**
 * How recently the user must have completed a real sign-in (magic link click
 * or Google OAuth round-trip) before a destructive account action is allowed
 * to execute. An engineering default for step-up authentication, chosen
 * because Budgts has no password to re-prompt for (mobile-launch spec §4:
 * Magic Link + Google OAuth only) — NOT a legal/retention period, and not
 * one of the still-open decisions in
 * docs/specs/2026-09-19-account-deletion-design.md §16/§15.
 */
export const REAUTH_WINDOW_MS = 10 * 60 * 1000;

/** True if `user`'s most recent sign-in is within the step-up window. */
export function isRecentlyAuthenticated(
  user: Pick<User, "last_sign_in_at">,
  windowMs: number = REAUTH_WINDOW_MS,
): boolean {
  if (!user.last_sign_in_at) return false;
  const lastSignIn = new Date(user.last_sign_in_at).getTime();
  if (Number.isNaN(lastSignIn)) return false;
  return Date.now() - lastSignIn <= windowMs;
}
