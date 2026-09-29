/**
 * DELETE /api/mobile/plaid/accounts/:rowId/review — Connected banks → "Clear the review flag" on one account
 * (`plaid_accounts.id`): an explicit owner action that stops the "Totals may be inaccurate" warning and touches no
 * transaction. Adapter over `clearAccountReviewFor`, shared with the web `clearAccountReview`. Another user's row → 404.
 */
import { mobilePlaidReply } from "@/lib/mobile/plaid-reply";
import { UUID_RE, mobileError, mobileRoute } from "@/lib/mobile/route";
import { clearAccountReviewFor } from "@/server/plaid/commands";

export const DELETE = mobileRoute<{ rowId: string }>(async ({ supabase }, _request, { params }) => {
  const { rowId } = await params;
  if (!UUID_RE.test(rowId)) return mobileError("not_found", 404);
  return mobilePlaidReply(await clearAccountReviewFor(supabase, rowId));
});
