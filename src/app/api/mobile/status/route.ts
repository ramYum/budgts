/**
 * GET /api/mobile/status — what the web dashboard layout shows around every page: the "Needs a category" bell's count,
 * the bank review warnings and the account-deletion lock (`loadMobileStatus`, each part from the web layout's own shared
 * function). The app re-reads it with each screen. Bearer only; RLS scopes every query.
 */
import { loadMobileStatus } from "@/lib/mobile/status";
import { mobileJson, mobileRoute } from "@/lib/mobile/route";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";

export const GET = mobileRoute(async ({ user, supabase }) => mobileJson(await loadMobileStatus(supabase, user.id, plaidUiEnabled())));
