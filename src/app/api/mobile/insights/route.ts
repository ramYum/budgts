/**
 * GET /api/mobile/insights?month=YYYY-MM — the Insights screen: Money Left, the savings rate and its change, the one
 * suggestion, the spending breakdown, income by source and the six-month trend. `loadInsights` is the very read and money
 * math the web Insights page renders; the figures beside the charts come from the same shared functions the web cards call.
 *
 * - Bearer only; identity is the token's verified user, never a request parameter.
 * - The month defaults to the user's current month in their stored time zone (never the server's UTC clock).
 * - Never partial money numbers: a failed side query answers a generic 503.
 */
import { loadInsights } from "@/lib/insights/load-insights";
import { buildMobileInsights } from "@/lib/mobile/insights";
import { MONTH_RE, mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";
import { profileTimeZone } from "@/lib/mobile/time-zone";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";

export const GET = mobileRoute(async ({ user, supabase }, request) => {
  const month = new URL(request.url).searchParams.get("month") ?? undefined;
  if (month !== undefined && !MONTH_RE.test(month)) return mobileError("invalid_month", 422);

  const timeZone = await profileTimeZone(supabase, user.id);
  if (!timeZone) return mobileError("not_onboarded", 409);

  const data = await loadInsights(supabase, { userId: user.id, timeZone, month, plaidEnabled: plaidUiEnabled() });
  if (data.degraded.length > 0) return mobileError("unavailable", 503);
  return mobileJson(buildMobileInsights(data));
});
