/**
 * GET /api/mobile/plaid/accounts/suggestions?plaidItemId=<plaid_items.id> — the mapping sheet's reconnect suggestions
 * (owner decision 2026-10-02): per unmapped Plaid account of that connection, the Budgts account the same bank account
 * fed before (`{ kind: "previous" }`) or several candidates (`{ kind: "ambiguous" }`). Adapter over
 * `loadMappingSuggestions`, the read the web `mappingSuggestionsAction` uses. A connection that is not the caller's is 404.
 */
import { mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";
import { loadMappingSuggestions } from "@/lib/plaid/mapping-suggestions";
import { mappingSuggestionsSchema } from "@/lib/validation/plaid";

export const GET = mobileRoute(async ({ user, supabase }, request) => {
  const parsed = mappingSuggestionsSchema.safeParse({ plaidItemId: new URL(request.url).searchParams.get("plaidItemId") ?? "" });
  if (!parsed.success) return mobileError("invalid_query", 400);
  const suggestions = await loadMappingSuggestions(supabase, user.id, parsed.data.plaidItemId);
  if (!suggestions) return mobileError("not_found", 404);
  return mobileJson({ version: 1, suggestions });
});
