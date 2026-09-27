import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentProfile = {
  onboarded_at: string | null;
  created_at: string;
  tour_seen_at: string | null;
  time_zone: string | null;
};

/**
 * The signed-in user's profile: the first-run gate's fields and their time
 * zone. Cached per request, so the dashboard layout (gate + <TimeZoneSync>)
 * and the page under it (its "this month") share one query. A failed read
 * throws to the error boundary rather than guessing.
 */
export const getCurrentProfile = cache(async (userId: string): Promise<CurrentProfile | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarded_at, created_at, tour_seen_at, time_zone")
    .eq("id", userId)
    .maybeSingle<CurrentProfile>();
  if (error) throw new Error(`Couldn't load your profile: ${error.message}`);
  return data;
});

/**
 * The user's IANA time zone, which decides their "today" and "this month".
 * Every onboarded profile has one (DB check `profiles_time_zone_when_onboarded`);
 * a profile without one hasn't finished onboarding, which is where it is set.
 */
export async function requireTimeZone(userId: string): Promise<string> {
  const profile = await getCurrentProfile(userId);
  if (!profile?.time_zone) redirect("/onboarding");
  return profile.time_zone;
}
