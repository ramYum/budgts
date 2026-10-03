/**
 * The mapping step's reconnect suggestions for one connection (`plaid_items.id`): per unmapped Plaid account, the
 * Budgts account the same bank account fed before (`reconnect-match.ts`). One read behind the web `AccountMapping`
 * (through `mappingSuggestionsAction`) and the native sheet (`GET /api/mobile/plaid/accounts/suggestions`).
 *
 * Takes the CALLER'S Supabase client: RLS limits every read to their own rows, and the matcher checks `userId` again.
 * Bounded: one connection's accounts, and the identities on that one institution. Null when the connection is not the
 * caller's (or is gone).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MappingSuggestion } from "@/lib/accounts/account-suggestion";
import { matchPreviousAccounts, type BankIdentity, type MatchableAccount } from "./reconnect-match";

export async function loadMappingSuggestions(
  supabase: SupabaseClient,
  userId: string,
  plaidItemId: string,
): Promise<Record<string, MappingSuggestion> | null> {
  const { data: item, error: itemErr } = await supabase
    .from("plaid_items")
    .select("id, institution_id")
    .eq("id", plaidItemId)
    .maybeSingle();
  if (itemErr) throw new Error(itemErr.message);
  if (!item) return null;
  const institutionId = (item.institution_id as string | null) ?? null;
  if (!institutionId) return {};

  const [{ data: newRows, error: newErr }, { data: identityRows, error: idErr }] = await Promise.all([
    supabase.from("plaid_accounts").select("plaid_account_id, mask, type, subtype").eq("plaid_item_id", plaidItemId).eq("link_state", "unmapped"),
    supabase
      .from("account_bank_identities")
      .select("user_id, account_id, institution_id, mask, type, subtype")
      .eq("user_id", userId)
      .eq("institution_id", institutionId),
  ]);
  if (newErr) throw new Error(newErr.message);
  if (idErr) throw new Error(idErr.message);
  const identities: BankIdentity[] = ((identityRows ?? []) as Record<string, string>[]).map((r) => ({
    userId: r.user_id,
    accountId: r.account_id,
    institutionId: r.institution_id,
    mask: r.mask,
    type: r.type,
    subtype: r.subtype,
  }));
  if (identities.length === 0 || (newRows ?? []).length === 0) return {};

  const accountIds = [...new Set(identities.map((i) => i.accountId))];
  const [{ data: accountRows, error: acctErr }, { data: linkRows, error: linkErr }] = await Promise.all([
    supabase.from("accounts").select("id, user_id, name, is_archived").in("id", accountIds),
    supabase.from("plaid_accounts").select("account_id").in("account_id", accountIds),
  ]);
  if (acctErr) throw new Error(acctErr.message);
  if (linkErr) throw new Error(linkErr.message);

  const accounts: MatchableAccount[] = ((accountRows ?? []) as { id: string; user_id: string; name: string; is_archived: boolean }[]).map(
    (a) => ({ id: a.id, userId: a.user_id, name: a.name, isArchived: a.is_archived }),
  );
  return matchPreviousAccounts({
    userId,
    institutionId,
    newAccounts: ((newRows ?? []) as { plaid_account_id: string; mask: string | null; type: string | null; subtype: string | null }[]).map(
      (r) => ({ plaidAccountId: r.plaid_account_id, mask: r.mask, type: r.type, subtype: r.subtype }),
    ),
    identities,
    accounts,
    liveLinkedAccountIds: new Set(((linkRows ?? []) as { account_id: string }[]).map((r) => r.account_id)),
  });
}
