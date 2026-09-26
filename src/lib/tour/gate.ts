/**
 * The welcome guide's gate: where a signed-in user must go before the app.
 * Every new user plays the guide automatically: `/onboarding` until they pick
 * a currency, then `/tour` until they finish or skip it (`tour_seen_at`).
 * Pure, so the rule is tested on its own; the dashboard layout applies it.
 */

export type FirstRunProfile = {
  onboarded_at: string | null;
  tour_seen_at: string | null;
};

/** `null` profile means the row doesn't exist yet (the signup trigger
 * hasn't landed); onboarding reports that case instead of guessing. */
export function firstRunRedirect(profile: FirstRunProfile | null): "/onboarding" | "/tour" | null {
  if (!profile?.onboarded_at) return "/onboarding";
  if (!profile.tour_seen_at) return "/tour";
  return null;
}
