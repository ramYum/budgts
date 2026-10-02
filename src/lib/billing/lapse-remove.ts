/**
 * The lapse sweep's production `removeItem`: the ONE shared disconnect (`src/server/plaid/disconnect.ts`), strict, with
 * the service-role client.
 *
 * Strict because a swallowed failure is not harmless here: the local row holds the only copy of the access token, so
 * deleting it after a failed `/item/remove` would leave an Item Plaid keeps billing for and nothing could ever remove.
 * Strict keeps the row (and logs Plaid's error) so the next scheduled run retries.
 *
 * The admin client bypasses RLS. Safe because every (userId, itemId) pair handed in here was selected by joining
 * `plaid_items` on that exact `user_id` (src/lib/billing/lapse.ts), the same guarantee account deletion relies on.
 * Disconnect writes only `plaid_items` (cascading `plaid_accounts`); transactions are kept, detached.
 */
import "server-only";
import { adminSupabase } from "@/lib/supabase/admin";
import { disconnectPlaidItem } from "@/server/plaid/disconnect";
import type { RemoveItem } from "./lapse";

export const removeItemViaSharedDisconnect: RemoveItem = async (userId, itemId) => {
  const result = await disconnectPlaidItem(adminSupabase(), { userId, itemId, purge: false, strict: true });
  return result.ok ? { ok: true } : result;
};
