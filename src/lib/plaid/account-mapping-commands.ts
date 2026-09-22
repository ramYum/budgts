/**
 * Account-mapping — one implementation behind the web `mapAccounts` Server Action (`src/server/plaid/actions.ts`) and the
 * native `POST /api/mobile/plaid/accounts/map` route (mobile-only-transition spec §4A). Per newly linked Plaid account:
 * create a new Budgts account, point at an existing one, or leave it unmapped. Runs the first sync afterward so imported
 * transactions are on screen immediately.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { findItemByPlaidItemId } from "@/lib/plaid/item-store";
import { plaidDb, syncItem } from "@/server/plaid/service";
import type { AccountMapEntryInput } from "@/lib/validation/plaid";

export type MapAccountsOutcome =
  | { outcome: "ok"; warning?: string }
  | { outcome: "item_not_found" }
  | { outcome: "failed"; message: string };

export async function mapPlaidAccounts(
  supabase: SupabaseClient,
  userId: string,
  plaidItemId: string,
  entries: AccountMapEntryInput[],
): Promise<MapAccountsOutcome> {
  // Confirm the Item is the caller's (RLS also enforces this; explicit here so "not found" is a real outcome, not a
  // silently empty write) and grab its Plaid `item_id` for the sync below.
  const { data: item } = await supabase.from("plaid_items").select("item_id").eq("id", plaidItemId).maybeSingle();
  if (!item) return { outcome: "item_not_found" };

  for (const entry of entries) {
    let accountId: string | null = null;
    let linkState: "mapped" | "ignored" = "ignored";

    if (entry.mode === "new") {
      const { data: created, error } = await supabase
        .from("accounts")
        .insert({ user_id: userId, name: entry.name, type: entry.type ?? "checking", source: "plaid" })
        .select("id")
        .single();
      if (error || !created) return { outcome: "failed", message: "Could not create the account. Try again." };
      accountId = created.id;
      linkState = "mapped";
    } else if (entry.mode === "existing") {
      accountId = entry.existingAccountId ?? null;
      linkState = "mapped";
    }

    const { error: linkErr } = await supabase
      .from("plaid_accounts")
      .update({ account_id: accountId, link_state: linkState })
      .eq("plaid_item_id", plaidItemId)
      .eq("plaid_account_id", entry.plaidAccountId);
    if (linkErr) return { outcome: "failed", message: "Could not save the account mapping. Try again." };
  }

  // First sync — so transactions are on screen when the user lands back. Ownership re-checked (the service-role
  // engine is reached only with an item_id confirmed to belong to this caller).
  const record = await findItemByPlaidItemId(plaidDb, item.item_id);
  if (record && record.userId === userId) {
    const result = await syncItem(record);
    if (!result.ok) return { outcome: "ok", warning: "Accounts saved. The first sync didn't finish — it'll retry shortly." };
  }

  return { outcome: "ok" };
}
