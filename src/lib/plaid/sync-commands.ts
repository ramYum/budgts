/**
 * "Sync now" for one connected Item — one implementation behind the web `syncConnection` Server Action
 * (`src/server/plaid/actions.ts`) and the native `POST /api/mobile/plaid/sync` route (mobile-only-transition spec §4A).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { findItemByPlaidItemId } from "@/lib/plaid/item-store";
import { plaidDb, syncItem } from "@/server/plaid/service";

export type SyncItemOutcome = { outcome: "ok"; warning?: string } | { outcome: "item_not_found" };

export async function syncPlaidItemForUser(supabase: SupabaseClient, userId: string, itemId: string): Promise<SyncItemOutcome> {
  // Ownership gate: RLS confirms this Item is the caller's before the service-role engine ever sees the id.
  const { data: owned } = await supabase.from("plaid_items").select("item_id").eq("item_id", itemId).maybeSingle();
  if (!owned) return { outcome: "item_not_found" };

  const record = await findItemByPlaidItemId(plaidDb, itemId);
  if (!record || record.userId !== userId) return { outcome: "item_not_found" };

  const result = await syncItem(record);
  if (!result.ok) return { outcome: "ok", warning: "Connected, but the first sync didn't finish. It'll retry shortly." };
  return { outcome: "ok" };
}
