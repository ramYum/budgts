/**
 * GET /api/mobile/home — the native Home screen's data: `loadHome`, the very reads and money math the web Home renders,
 * projected into a small explicit view-model (`src/lib/mobile/home.ts`) instead of raw rows.
 *
 * - Bearer only; identity is the token's verified user. The request has no parameters that choose a user or a month.
 * - The month and "today" come from the user's stored time zone (`profiles.time_zone`), never the server's UTC clock.
 * - Every query runs through a client carrying the caller's own JWT, so RLS scopes it to that user.
 * - Never partial money numbers: if any side query failed, the answer is a generic 503, not a wrong Money Left.
 *
 * Design authority: docs/specs/2026-09-17-mobile-app-launch-design.md §4/§6/§7.
 */
import { loadHome } from "@/lib/home/load-home";
import { buildMobileHome } from "@/lib/mobile/home";
import { mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";
import { profileTimeZone } from "@/lib/mobile/time-zone";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";

export const GET = mobileRoute(async ({ user, supabase }) => {
  const timeZone = await profileTimeZone(supabase, user.id);
  if (!timeZone) return mobileError("not_onboarded", 409);

  const home = await loadHome(supabase, { userId: user.id, timeZone, plaidEnabled: plaidUiEnabled() });
  if (home.degraded.length > 0) return mobileError("unavailable", 503);
  return mobileJson(buildMobileHome(home));
});
