/**
 * POST /api/mobile/plaid/accounts/map — `{ plaidItemId, entries }`: per newly linked Plaid account, create a new Budgts
 * account, point at an existing one, or don't import it, then run the first sync. Adapter over `mapAccountsFor`, shared
 * with the web `mapAccounts` Server Action. A malformed body is 422 `invalid` (the form's own error); the command
 * refusing what the screen showed (already imported, paused, gone) is 422 `refused`, and a missing bank or account 404
 * with the command's sentence, so the app offers Refresh only for those.
 */
import { mobilePlaidReply } from "@/lib/mobile/plaid-reply";
import { mobileError, mobileRoute, readJson } from "@/lib/mobile/route";
import { mapAccountsSchema } from "@/lib/validation/plaid";
import { mapAccountsFor } from "@/server/plaid/commands";

export const POST = mobileRoute(async ({ user, supabase }, request) => {
  const body = await readJson(request);
  if (body === null || typeof body !== "object") return mobileError("invalid_body", 400);

  const parsed = mapAccountsSchema.safeParse(body);
  if (!parsed.success) {
    return mobileError("invalid", 422, {
      fieldErrors: { form: parsed.error.issues[0]?.message ?? "Check the account choices and try again." },
    });
  }
  return mobilePlaidReply(await mapAccountsFor(supabase, user.id, parsed.data.plaidItemId, parsed.data.entries), { refusal: "refused" });
});
