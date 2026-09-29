/**
 * POST /api/mobile/transactions/:id/categorize — "Needs a category": `{ categoryId }` or `{ standardCategoryName }` for
 * one imported bank transaction (a merchant group's `anchorId`). Marks it user-set so a re-sync never overwrites it,
 * remembers the merchant's category and fills the same merchant's other blank rows. Adapter over
 * `categorizeBankTransactionFor`, shared with the web action. Another user's row is invisible under RLS → 404.
 */
import { mobilePlaidReply } from "@/lib/mobile/plaid-reply";
import { UUID_RE, mobileError, mobileRoute, readObject } from "@/lib/mobile/route";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { categorizeBankTransactionFor } from "@/server/plaid/commands";

export const POST = mobileRoute<{ id: string }>(async ({ user, supabase }, request, { params }) => {
  const { id } = await params;
  if (!UUID_RE.test(id)) return mobileError("not_found", 404);
  if (!plaidUiEnabled()) return mobileError("not_found", 404);

  const body = await readObject(request);
  if (!body) return mobileError("invalid_body", 400);
  const categoryId = typeof body.categoryId === "string" && body.categoryId ? body.categoryId : undefined;
  const standardCategoryName =
    typeof body.standardCategoryName === "string" && body.standardCategoryName ? body.standardCategoryName : undefined;

  return mobilePlaidReply(await categorizeBankTransactionFor(supabase, user.id, { transactionId: id, categoryId, standardCategoryName }));
});
