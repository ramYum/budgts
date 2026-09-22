/**
 * POST /api/mobile/plaid/accounts/map — `{ plaidItemId, entries }`: per newly linked Plaid account, create a new
 * Budgts account, point at an existing one, or leave it unmapped, then run the first sync. Adapter over
 * `mapPlaidAccounts` (mobile-only-transition spec §4A), shared with the web `mapAccounts` Server Action.
 */
import { mapPlaidAccounts } from "@/lib/plaid/account-mapping-commands";
import { mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";
import { mapAccountsSchema } from "@/lib/validation/plaid";

export const POST = mobileRoute(async ({ user, supabase }, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mobileError("invalid_body", 400);
  }

  const parsed = mapAccountsSchema.safeParse(body);
  if (!parsed.success) {
    return mobileError("invalid", 422, {
      fieldErrors: { form: parsed.error.issues[0]?.message ?? "Check the account choices and try again." },
    });
  }

  const result = await mapPlaidAccounts(supabase, user.id, parsed.data.plaidItemId, parsed.data.entries);
  if (result.outcome === "item_not_found") return mobileError("not_found", 404);
  if (result.outcome === "failed") return mobileError("unavailable", 503);
  return mobileJson({ ok: true, ...(result.warning ? { warning: result.warning } : {}) });
});
