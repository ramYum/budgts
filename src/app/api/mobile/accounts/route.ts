/**
 * GET  /api/mobile/accounts — the caller's accounts, with `selectable` (may a manual transaction be entered against it).
 * POST /api/mobile/accounts — `{ name, type }`: add a manual account.
 *
 * Adapters over `src/lib/mobile/reads.ts` and `src/lib/accounts/commands.ts` (shared with the web Server Action).
 */
import { createAccount } from "@/lib/accounts/commands";
import { MOBILE_API_VERSION, loadAccounts } from "@/lib/mobile/reads";
import { mobileCommandError, mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { ACCOUNT_TYPES } from "@/lib/validation/account";

export const GET = mobileRoute(async ({ supabase }) => {
  return mobileJson({
    version: MOBILE_API_VERSION,
    accounts: await loadAccounts(supabase, plaidUiEnabled()),
    // Additive field (compatibility rule, spec §4A): the account types the server accepts, for the app's type picker.
    accountTypes: [...ACCOUNT_TYPES],
  });
});

export const POST = mobileRoute(async ({ user, supabase }, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mobileError("invalid_body", 400);
  }

  const result = await createAccount(supabase, user.id, body);
  return result.ok ? mobileJson({ id: result.id }, 201) : mobileCommandError(result);
});
