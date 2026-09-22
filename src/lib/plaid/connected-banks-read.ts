/**
 * The connected-banks data load — one implementation behind the web `BankConnections` server component
 * (`src/components/plaid/bank-connections.tsx`) and the native `GET /api/mobile/plaid/banks` route
 * (mobile-only-transition spec §4A). RLS-scoped through the caller's own Supabase client. Returns `[]` rather than
 * throwing when the Plaid tables aren't present on this deployment (pre-migration-0004 environments) — the same
 * self-gating `BankConnections` already relies on.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

export type ConnectedBankAccount = {
  rowId: string;
  plaidAccountId: string;
  name: string | null;
  officialName: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  currentBalance: number | null;
  isoCurrencyCode: string | null;
  linkState: "mapped" | "ignored" | "unmapped";
  mappedAccountName: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  excludedFromCalculations: boolean;
  /** Rows still held pending sign-convention verification — see `pendingSignCheckCount` callers for why this must
   * never be silently omitted. */
  pendingSignCheckCount: number;
};

export type MappableAccount = {
  plaidAccountId: string;
  name: string | null;
  officialName: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  currentBalance: number | null;
  isoCurrencyCode: string | null;
};

export type ConnectedBank = {
  id: string;
  itemId: string;
  institutionName: string | null;
  status: "active" | "login_required" | "pending_expiration" | "revoked" | "error";
  lastSyncedAt: string | null;
  accounts: ConnectedBankAccount[];
  unmappedAccounts: MappableAccount[];
};

type PlaidItemRow = {
  id: string;
  item_id: string;
  institution_name: string | null;
  status: ConnectedBank["status"];
  last_synced_at: string | null;
};

type PlaidAccountRow = {
  id: string;
  plaid_item_id: string;
  plaid_account_id: string;
  name: string | null;
  official_name: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  current_balance: number | null;
  iso_currency_code: string | null;
  link_state: "mapped" | "ignored" | "unmapped";
  account_id: string | null;
  needs_review: boolean;
  review_reason: string | null;
  excluded_from_calculations: boolean;
};

export async function loadConnectedBanksData(supabase: SupabaseClient): Promise<ConnectedBank[]> {
  const { data: itemsData, error: itemsErr } = await supabase
    .from("plaid_items")
    .select("id, item_id, institution_name, status, last_synced_at")
    .order("created_at", { ascending: true });
  if (itemsErr) return []; // tables not present on this deployment

  const items = (itemsData ?? []) as PlaidItemRow[];

  const [{ data: acctData }, { data: budgtsAcctData }, pendingSignRows] = await Promise.all([
    supabase
      .from("plaid_accounts")
      .select(
        "id, plaid_item_id, plaid_account_id, name, official_name, mask, type, subtype, current_balance, iso_currency_code, link_state, account_id, needs_review, review_reason, excluded_from_calculations",
      ),
    supabase.from("accounts").select("id, name").eq("is_archived", false).order("name"),
    // fetchAllRows, not a bare await — see fetch-all-rows.ts: a heavy Plaid feed's full initial import can exceed the
    // PostgREST 1000-row default, which would undercount the very "we're checking this account" notice this exists for.
    fetchAllRows<{ plaid_account_id: string }>((from, to) =>
      supabase
        .from("transactions")
        .select("plaid_account_id")
        .eq("status", "pending_review")
        .eq("pending_reason", "sign_convention_unknown")
        .not("plaid_account_id", "is", null)
        .order("id")
        .range(from, to),
    ),
  ]);

  const plaidAccounts = (acctData ?? []) as PlaidAccountRow[];
  const accountName = new Map(((budgtsAcctData ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]));
  const pendingSignCheckCounts = new Map<string, number>();
  for (const r of pendingSignRows) {
    pendingSignCheckCounts.set(r.plaid_account_id, (pendingSignCheckCounts.get(r.plaid_account_id) ?? 0) + 1);
  }

  return items.map((item) => {
    const rows = plaidAccounts.filter((a) => a.plaid_item_id === item.id);
    const accounts: ConnectedBankAccount[] = rows.map((a) => ({
      rowId: a.id,
      plaidAccountId: a.plaid_account_id,
      name: a.name,
      officialName: a.official_name,
      mask: a.mask,
      type: a.type,
      subtype: a.subtype,
      currentBalance: a.current_balance,
      isoCurrencyCode: a.iso_currency_code,
      linkState: a.link_state,
      mappedAccountName: a.account_id ? (accountName.get(a.account_id) ?? null) : null,
      needsReview: a.needs_review,
      reviewReason: a.review_reason,
      excludedFromCalculations: a.excluded_from_calculations,
      pendingSignCheckCount: pendingSignCheckCounts.get(a.id) ?? 0,
    }));
    const unmappedAccounts: MappableAccount[] = rows
      .filter((a) => a.link_state === "unmapped")
      .map((a) => ({
        plaidAccountId: a.plaid_account_id,
        name: a.name,
        officialName: a.official_name,
        mask: a.mask,
        type: a.type,
        subtype: a.subtype,
        currentBalance: a.current_balance,
        isoCurrencyCode: a.iso_currency_code,
      }));
    return {
      id: item.id,
      itemId: item.item_id,
      institutionName: item.institution_name,
      status: item.status,
      lastSyncedAt: item.last_synced_at,
      accounts,
      unmappedAccounts,
    };
  });
}
