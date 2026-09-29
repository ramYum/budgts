/**
 * GET /api/mobile/hub — the small counts the More and Settings hubs show beside each row ("2 goals", "1 bank"): `hubCounts`,
 * the same head-only counts the web hubs read. `banks` is null when bank connections are switched off. "This month" (the
 * budgets count) is the user's own, from their stored time zone. Bearer only; RLS scopes every count.
 */
import { hubCounts } from "@/lib/hub-counts";
import { MOBILE_API_VERSION } from "@/lib/mobile/reads";
import { mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";
import type { MobileHub } from "@/lib/mobile/screens";
import { profileTimeZone } from "@/lib/mobile/time-zone";

export const GET = mobileRoute(async ({ user, supabase }) => {
  const timeZone = await profileTimeZone(supabase, user.id);
  if (!timeZone) return mobileError("not_onboarded", 409);
  const hub: MobileHub = { version: MOBILE_API_VERSION, ...(await hubCounts(supabase, timeZone)) };
  return mobileJson(hub);
});
