/**
 * GET /api/mobile/settings/categories — Settings → Categories: every category (active and archived) with this month's
 * transaction count, from `loadCategorySettings` (the reads the web page renders). "This month" is the user's own, from
 * their stored time zone. Bearer only; RLS scopes every query.
 */
import { loadCategorySettings } from "@/lib/categories/load-category-settings";
import { buildMobileCategorySettings } from "@/lib/mobile/categories";
import { mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";
import { profileTimeZone } from "@/lib/mobile/time-zone";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";

export const GET = mobileRoute(async ({ user, supabase }) => {
  const timeZone = await profileTimeZone(supabase, user.id);
  if (!timeZone) return mobileError("not_onboarded", 409);
  const data = await loadCategorySettings(supabase, { timeZone, plaidEnabled: plaidUiEnabled() });
  return mobileJson(buildMobileCategorySettings(data));
});
