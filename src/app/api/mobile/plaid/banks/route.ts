/**
 * GET /api/mobile/plaid/banks — the caller's connected banks (status, per-account mapping state, needs-review /
 * pending-sign-check flags, unmapped accounts awaiting a mapping choice) and their Budgts accounts (the mapping
 * choices), and whether their banks were removed when their subscription ended. Adapter over `loadConnectedBanks`, the read the web `BankConnections` component uses.
 */
import { mobileJson, mobileRoute } from "@/lib/mobile/route";
import { loadConnectedBanks } from "@/lib/plaid/connected-banks-read";
import { loadDetachedHeld } from "@/lib/plaid/detached-held-read";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";

export const GET = mobileRoute(async ({ supabase }) => {
  if (!plaidUiEnabled()) {
    return mobileJson({ version: 1, enabled: false, banks: [], budgtsAccounts: [], connectionsRemovedForLapse: false, removedBanksHeld: { groups: [], answered: [] } });
  }
  const [data, removedBanksHeld] = await Promise.all([loadConnectedBanks(supabase), loadDetachedHeld(supabase)]);
  return mobileJson({
    version: 1,
    enabled: data !== null,
    banks: data?.banks ?? [],
    budgtsAccounts: data?.budgtsAccounts ?? [],
    connectionsRemovedForLapse: data?.connectionsRemovedForLapse ?? false,
    // Held rows a disconnected bank left behind (card payments §5c): groups to ask about, and answered groups.
    removedBanksHeld,
  });
});
