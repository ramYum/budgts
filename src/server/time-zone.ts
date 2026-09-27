"use server";

import { revalidateUserData } from "@/server/revalidate";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { timeZoneSchema } from "@/lib/validation/profile";

export type SyncTimeZoneResult = { ok: true } | { ok: false; error: string };

/**
 * Store the time zone the user's device reports, so their "today" and "this
 * month" follow them when they travel or move. Called by <TimeZoneSync> only
 * when the device's zone differs from the stored one. Revalidating re-renders
 * the page the user is on with the new month in the same response.
 */
export async function syncTimeZone(timeZone: string): Promise<SyncTimeZoneResult> {
  const parsed = timeZoneSchema.safeParse(timeZone);
  if (!parsed.success) return { ok: false, error: `Not a time zone: ${JSON.stringify(timeZone)}` };

  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Signed out" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ time_zone: parsed.data })
    .eq("id", user.id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "No profile row to update" };

  revalidateUserData();
  return { ok: true };
}
