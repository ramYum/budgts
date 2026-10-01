/**
 * GET /api/mobile/activity — the Activity screen's panels beside the ledger (`GET /api/mobile/transactions`): "Needs a
 * category" grouped by merchant (the same window, rows and Plaid hints the web panel shows), the standard categories the
 * picker can add back, and the limited-history advisory. Actions: `POST /api/mobile/transactions/:id/categorize` and
 * `POST /api/mobile/transactions/rescan`. Bearer only; RLS scopes every query. A failed read is a generic 503, never a
 * silently empty to-do list.
 */
import { after } from "next/server";
import { loadMobileActivityExtras } from "@/lib/mobile/status";
import { mobileJson, mobileRoute } from "@/lib/mobile/route";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { nudgeRefresh } from "@/server/plaid/service";

export const GET = mobileRoute(async ({ user, supabase }) => {
  const plaidOn = plaidUiEnabled();
  // The web transactions page's nudge: ask Plaid to check for new data now that the person is looking, after the answer and
  // never holding it up. nudgeRefresh is the shared, throttled, never-throwing claim (src/server/plaid/service.ts).
  if (plaidOn) after(() => nudgeRefresh(user.id));
  return mobileJson(await loadMobileActivityExtras(supabase, user.id, plaidOn));
});
