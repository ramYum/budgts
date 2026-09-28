/**
 * The connected-banks data load — one implementation behind the web `BankConnections` server component
 * (`src/components/plaid/bank-connections.tsx`) and the native `GET /api/mobile/plaid/banks` route. Moved out of the
 * component unchanged (Stage 0 port). RLS-scoped through the caller's own Supabase client. Returns null when the Plaid
 * tables aren't present on this deployment (pre-migration-0004 environments), the self-gating `BankConnections` relies on.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

export type ConnectedBankAccount = {
  rowId: string;
  plaidAccountId: string;
  name: string | null;
  officialName: string | null;
  mask: string | null;
  /** Plaid's own account type/subtype — only used to guess a default name/type
   * when quick-connecting a never-mapped account (see ConnectToggle). */
  type: string | null;
  subtype: string | null;
  linkState: "mapped" | "ignored" | "unmapped";
  mappedAccountName: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  excludedFromCalculations: boolean;
  /** Rows still held pending sign-convention verification (design 2026-09-12
   *  North Star §2) — never confirmed, so never counted anywhere, until this
   *  is 0. Drives the "We're checking this account's transaction format"
   *  notice; must never be silently omitted. */
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

export type ConnectedBanksData = {
  banks: ConnectedBank[];
  /** The user's active Budgts accounts (id, name): the mapping choices. */
  budgtsAccounts: { id: string; name: string }[];
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

export async function loadConnectedBanks(supabase: SupabaseClient): Promise<ConnectedBanksData | null> {
  const { data: itemsData, error: itemsErr } = await supabase
    .from("plaid_items")
    .select("id, item_id, institution_name, status, last_synced_at")
    .order("created_at", { ascending: true });
  if (itemsErr) return null; // tables not present on this deployment

  const items = (itemsData ?? []) as PlaidItemRow[];

  const [{ data: acctData }, { data: budgtsAcctData }, pendingSignRows] = await Promise.all([
    supabase
      .from("plaid_accounts")
      .select(
        "id, plaid_item_id, plaid_account_id, name, official_name, mask, type, subtype, current_balance, iso_currency_code, link_state, account_id, needs_review, review_reason, excluded_from_calculations",
      ),
    supabase.from("accounts").select("id, name").eq("is_archived", false).order("name"),
    // Design: 2026-09-12 North Star §2 — while unresolved, the UI must say so
    // ("We're checking this account's transaction format") rather than let
    // transactions silently vanish from every total. IDs only, tallied below —
    // an aggregate count isn't available through PostgREST without an RPC.
    // fetchAllRows, not a bare await: this exact account can hold thousands of
    // pending rows (a heavy Plaid feed's full initial import) — an unbounded
    // `.select()` silently caps at PostgREST's default 1000, which would
    // undercount the very notice this query exists to make accurate (see
    // fetch-all-rows.ts for the confirmed real-world case that pattern fixed).
    fetchAllRows<{ plaid_account_id: string }>((from, to, count) =>
      supabase
        .from("transactions")
        .select("plaid_account_id", { count })
        .eq("status", "pending_review")
        .eq("pending_reason", "sign_convention_unknown")
        .not("plaid_account_id", "is", null)
        .order("id")
        .range(from, to),
    ),
  ]);

  const plaidAccounts = (acctData ?? []) as PlaidAccountRow[];
  const budgtsAccounts = (budgtsAcctData ?? []) as { id: string; name: string }[];
  const accountName = new Map(budgtsAccounts.map((a) => [a.id, a.name]));
  const pendingSignCheckCounts = new Map<string, number>();
  for (const r of pendingSignRows) {
    pendingSignCheckCounts.set(r.plaid_account_id, (pendingSignCheckCounts.get(r.plaid_account_id) ?? 0) + 1);
  }

  const banks: ConnectedBank[] = items.map((item) => {
    const rows = plaidAccounts.filter((a) => a.plaid_item_id === item.id);
    const accounts: ConnectedBankAccount[] = rows.map((a) => ({
      rowId: a.id,
      plaidAccountId: a.plaid_account_id,
      name: a.name,
      officialName: a.official_name,
      mask: a.mask,
      type: a.type,
      subtype: a.subtype,
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

  return { banks, budgtsAccounts };
}
