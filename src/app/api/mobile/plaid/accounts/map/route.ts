/**
 * POST /api/mobile/plaid/accounts/map — `{ plaidItemId, entries }`: per newly linked Plaid account, create a new Budgts
 * account, point at an existing one, or don't import it, then run the first sync. Adapter over `mapAccountsFor`, shared
 * with the web `mapAccounts` Server Action.
 */
import { mobileError, mobileJson, mobileRoute, readJson } from "@/lib/mobile/route";
import { mapAccountsSchema } from "@/lib/validation/plaid";
import { mapAccountsFor, type PlaidCommandResult } from "@/server/plaid/commands";

/** Maps a Plaid command result to the wire. `warning` is user-facing text (the work succeeded; a sync did not finish). */
function reply(result: PlaidCommandResult) {
  if (result.ok) return mobileJson({ ok: true, ...(result.warning ? { warning: result.warning } : {}) });
  if (result.error === "not_found") return mobileError("not_found", 404);
  if (result.error === "invalid") return mobileError("invalid", 422, { fieldErrors: { form: result.message } });
  return mobileError("unavailable", 503);
}

export const POST = mobileRoute(async ({ user, supabase }, request) => {
  const body = await readJson(request);
  if (body === null || typeof body !== "object") return mobileError("invalid_body", 400);

  const parsed = mapAccountsSchema.safeParse(body);
  if (!parsed.success) {
    return mobileError("invalid", 422, {
      fieldErrors: { form: parsed.error.issues[0]?.message ?? "Check the account choices and try again." },
    });
  }
  return reply(await mapAccountsFor(supabase, user.id, parsed.data.plaidItemId, parsed.data.entries));
});
