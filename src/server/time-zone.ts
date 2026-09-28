"use server";

import { revalidateUserData } from "@/server/revalidate";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { saveTimeZone } from "@/lib/profile/onboarding";

export type SyncTimeZoneResult = { ok: true } | { ok: false; error: string };

/**
 * Store the time zone the user's device reports, so their "today" and "this
 * month" follow them when they travel or move. Called by <TimeZoneSync> only
 * when the device's zone differs from the stored one. Revalidating re-renders
 * the page the user is on with the new month in the same response. The rule
 * is shared with the native app (`saveTimeZone`, `/api/mobile/profile`).
 */
export async function syncTimeZone(timeZone: string): Promise<SyncTimeZoneResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Signed out" };

  const result = await saveTimeZone(await createClient(), user.id, timeZone);
  if (!result.ok) {
    switch (result.error) {
      case "invalid_time_zone":
        return { ok: false, error: `Not a time zone: ${JSON.stringify(timeZone)}` };
      case "profile_missing":
        return { ok: false, error: "No profile row to update" };
      default:
        return { ok: false, error: result.message ?? "Update failed" };
    }
  }

  revalidateUserData();
  return { ok: true };
}
