/**
 * POST /api/mobile/plaid/refresh — the native pull to refresh's bank check (no body): asks Plaid to look for new
 * transactions at the caller's banks now. This is the ONLY place Budgts calls Plaid's billed Transactions Refresh
 * (owner decision 2026-10-02); page loads never do.
 *
 * - Bearer only; the Items are the verified caller's own. Nothing in the request chooses a user or an Item.
 * - Answers 202 at once and runs the refresh after the response (`after`), so the pull spinner never waits on Plaid.
 *   The app re-reads its data alongside; anything new Plaid finds lands later through the webhook -> sync path.
 * - Throttled on the server to once per 24 hours per Item (`claimItemsDueForRefresh`), however often the user pulls.
 *
 * Phase 4 follow-up: gate on the bank-sync entitlement (`requirePremium`) once billing is switched on.
 */
import { after } from "next/server";
import { mobileJson, mobileRoute } from "@/lib/mobile/route";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { refreshBankItems } from "@/server/plaid/service";

export const POST = mobileRoute(async ({ user }) => {
  if (!plaidUiEnabled()) return mobileJson({ scheduled: false });
  after(() => refreshBankItems(user.id));
  return mobileJson({ scheduled: true }, 202);
});
