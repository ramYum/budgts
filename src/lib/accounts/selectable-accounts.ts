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
 * The account if the caller can see it (RLS, so never another user's) and it isn't archived; otherwise null. On its own
 * it is the check for pointing a bank link at an existing account (`mapAccountsFor`), where a disconnected bank's
 * leftover account is a legitimate target. Takes the CALLER'S Supabase client.
 */
export async function readOwnOpenAccount(supabase: SupabaseClient, accountId: string): Promise<SelectableAccountRow | null> {
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, source, is_archived")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.is_archived) return null;
  return { id: data.id as string, name: data.name as string, source: data.source as SelectableAccountRow["source"] };
}

/**
 * The server-side form of {@link selectableAccounts} for one account: can a transaction be added to it, or moved onto
 * it? It must be the caller's own open account ({@link readOwnOpenAccount}) and, if it came from a bank, still linked.
 */
export async function accountAcceptsEntries(supabase: SupabaseClient, accountId: string): Promise<boolean> {
  const account = await readOwnOpenAccount(supabase, accountId);
  if (!account) return false;
  if (account.source === "manual") return true;

  const { data: links, error: linkError } = await supabase
    .from("plaid_accounts")
    .select("id")
    .eq("account_id", accountId)
    .limit(1);
  if (linkError) throw new Error(linkError.message);
  const live = new Set((links ?? []).length > 0 ? [accountId] : []);
  return selectableAccounts([account], live).length === 1;
}
