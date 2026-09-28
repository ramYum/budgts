/**
 * The Bearer-client form of `requireTimeZone()` (`src/lib/current-profile.ts`): the caller's IANA time zone, which decides
 * their "today" and "this month", read through the caller's own Supabase client. Every onboarded profile has one (DB check
 * `profiles_time_zone_when_onboarded`); null means the user has not finished onboarding (or has no profile), and the route
 * answers `not_onboarded` so the app sends them to Get Started — the web redirects to /onboarding for the same reason.
 * Never a guessed zone, never the server's clock.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProfile } from "@/lib/profile/onboarding";

export async function profileTimeZone(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const profile = await loadProfile(supabase, userId);
  return profile?.onboarded && profile.timeZone ? profile.timeZone : null;
}
