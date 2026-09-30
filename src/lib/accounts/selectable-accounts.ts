import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Which accounts belong in a manual transaction-entry dropdown (Add income,
 * Add transaction). A Plaid-derived account only qualifies while it still has
 * a live `plaid_accounts` link — disconnecting a bank deletes that link but
 * deliberately keeps the `accounts` row (so past transactions stay attached),
 * so `source` alone can't tell "currently connected" from "used to be." A
 * manual account (never Plaid) always qualifies.
 */
export interface SelectableAccountRow {
  id: string;
  name: string;
  source: "manual" | "plaid";
}

export function selectableAccounts(
  accounts: readonly SelectableAccountRow[],
  liveLinkedAccountIds: ReadonlySet<string>,
): { id: string; name: string }[] {
  return accounts
    .filter((a) => a.source === "manual" || liveLinkedAccountIds.has(a.id))
    .map((a) => ({ id: a.id, name: a.name }));
}

/**
 * The server-side form of the same rule, for one account: can a transaction be
 * added to it, or moved onto it? It must be visible to the caller (RLS, so never
 * another user's), not archived, and selectable by {@link selectableAccounts}.
 * Takes the CALLER'S Supabase client.
 */
export async function accountAcceptsEntries(supabase: SupabaseClient, accountId: string): Promise<boolean> {
  const { data: account, error } = await supabase
    .from("accounts")
    .select("id, name, source, is_archived")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!account || account.is_archived) return false;
  if (account.source === "manual") return true;

  const { data: links, error: linkError } = await supabase
    .from("plaid_accounts")
    .select("id")
    .eq("account_id", accountId)
    .limit(1);
  if (linkError) throw new Error(linkError.message);
  const live = new Set((links ?? []).length > 0 ? [accountId] : []);
  return selectableAccounts([account as SelectableAccountRow], live).length === 1;
}
