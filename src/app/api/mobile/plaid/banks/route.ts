/**
 * GET /api/mobile/plaid/banks — the caller's connected banks (status, per-account mapping state, needs-review /
 * pending-sign-check flags, unmapped accounts awaiting a mapping choice). Adapter over `loadConnectedBanksData`
 * (mobile-only-transition spec §4A), shared with the web `BankConnections` component.
 */
import { loadConnectedBanksData } from "@/lib/plaid/connected-banks-read";
import { mobileJson, mobileRoute } from "@/lib/mobile/route";

export const GET = mobileRoute(async ({ supabase }) => {
  return mobileJson({ version: 1, banks: await loadConnectedBanksData(supabase) });
});
