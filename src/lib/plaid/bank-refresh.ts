/**
 * The throttle gate for Plaid's Transactions Refresh (`/transactions/refresh`), which Plaid bills as a flat fee per
 * successful call. Plaid already checks every Item for new transactions 1-4 times a day on its own and tells us by
 * webhook, so Budgts asks for an extra check ONLY when the user pulls down to refresh in the native app
 * (POST /api/mobile/plaid/refresh, owner decision 2026-10-02), and at most once per REFRESH_THROTTLE_MS per Item.
 * The orchestration (decrypt, call Plaid, log) is `refreshBankItems` in src/server/plaid/service.ts.
 */
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { PlaidDb } from "./sync-store";
import { plaidItems } from "@/lib/db/schema";

/**
 * At most one Transactions Refresh per Item per 24 hours, however often the user pulls: about 30 billed calls per bank
 * per month at most. The window also keeps us clear of institutions that refresh through a simulated login ("Classic"
 * integrations in Plaid's Item Debugger), where frequent refreshes risk tripping the bank's own fraud detection.
 */
export const REFRESH_THROTTLE_MS = 24 * 60 * 60 * 1000;

/**
 * Atomically claims the user's active Items whose last refresh request is older than REFRESH_THROTTLE_MS (or that never
 * had one), stamping `last_refresh_requested_at = now()` in the same UPDATE...RETURNING. The UPDATE is the throttle
 * itself: concurrent pulls (two screens, two devices) cannot both claim an Item. Scoped by `user_id` explicitly, since
 * the pipeline's connection bypasses RLS.
 */
export async function claimItemsDueForRefresh(
  db: PlaidDb,
  userId: string,
): Promise<{ itemId: string; accessTokenEnc: string }[]> {
  const cutoff = new Date(Date.now() - REFRESH_THROTTLE_MS);
  return db
    .update(plaidItems)
    .set({ lastRefreshRequestedAt: sql`now()` })
    .where(
      and(
        eq(plaidItems.userId, userId),
        eq(plaidItems.status, "active"),
        or(isNull(plaidItems.lastRefreshRequestedAt), lt(plaidItems.lastRefreshRequestedAt, cutoff)),
      ),
    )
    .returning({ itemId: plaidItems.itemId, accessTokenEnc: plaidItems.accessTokenEnc });
}
