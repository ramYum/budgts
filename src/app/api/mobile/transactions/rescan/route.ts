/**
 * POST /api/mobile/transactions/rescan — "Re-scan": fill the verified user's still-uncategorised bank rows the
 * deterministic evidence chain can now resolve. Idempotent; never touches user-set, removed or transfer rows.
 * `{ ok: true, warning: "Nothing new to categorise." }` when nothing changed. Adapter over `rescanUncategorizedFor`,
 * shared with the web action; the user id is the token's, never the request's.
 */
import { mobilePlaidReply } from "@/lib/mobile/plaid-reply";
import { mobileError, mobileRoute } from "@/lib/mobile/route";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { rescanUncategorizedFor } from "@/server/plaid/commands";

export const POST = mobileRoute(async ({ user }) => {
  if (!plaidUiEnabled()) return mobileError("not_found", 404);
  return mobilePlaidReply(await rescanUncategorizedFor(user.id));
});
