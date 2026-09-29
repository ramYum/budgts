/**
 * GET /api/mobile/accounts/overview — the Accounts screen: accounts grouped under the bank that links them (with its
 * connection state and each account's last four), then the ones added by hand, then archived, each with this month's
 * transaction count. `loadAccountsOverview` is the read the web Accounts page renders; "this month" is the user's own.
 * (`GET /api/mobile/accounts` stays the flat list for pickers.) Bearer only; RLS scopes every query.
 */
import { loadAccountsOverview } from "@/lib/accounts/load-accounts-overview";
import { MOBILE_API_VERSION } from "@/lib/mobile/reads";
import { mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";
import type { MobileAccountsOverview } from "@/lib/mobile/screens";
import { profileTimeZone } from "@/lib/mobile/time-zone";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";

export const GET = mobileRoute(async ({ user, supabase }) => {
  const timeZone = await profileTimeZone(supabase, user.id);
  if (!timeZone) return mobileError("not_onboarded", 409);
  const overview = await loadAccountsOverview(supabase, { timeZone, plaidEnabled: plaidUiEnabled() });
  const body: MobileAccountsOverview = { version: MOBILE_API_VERSION, ...overview };
  return mobileJson(body);
});
