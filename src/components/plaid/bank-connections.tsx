import { createClient, getSessionUser } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { ConnectBank } from "./connect-bank";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/icon";
import { IconTile } from "@/components/ui";
import {
  ConnectedBanks,
  type ConnectedBank,
  type ConnectedBankAccount,
} from "./connected-banks";
import type { MappableAccount } from "./account-mapping";

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

/**
 * "Connected banks" section for `/settings` (design §8, §23, §24). Self-gates
 * on `plaidUiEnabled()` and on the Plaid tables existing, so it is inert on any
 * deployment that has not run migration 0004.
 */
export async function BankConnections() {
  if (!plaidUiEnabled()) return null;

  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();

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

  return (
    <>
      <PageHeader title="Connected banks" back="/more" backOnDesktop={false} />
      <div className="space-y-6 md:max-w-[720px]">
        {banks.length === 0 ? (
          <div className="px-card-ink flex flex-col items-start gap-4 p-3 md:p-6">
            <IconTile name="bank" />
            <p className="text-[15px] leading-6 text-ink">
              Connect a bank and Budgts imports its transactions for you — categories filled in, ready to check.
              Manual entry still works for cash and anything your bank can&apos;t reach.
            </p>
            <p className="flex items-start gap-2 text-sm leading-5 text-muted">
              <Icon name="shield" className="-my-0.5 text-graphite" />
              Your data is secure. Budgts can only read your account and transaction data to help you budget — it
              cannot send money, make payments, make purchases, or transfer funds.
            </p>
          </div>
        ) : (
          <ConnectedBanks banks={banks} budgtsAccounts={budgtsAccounts} />
        )}
        {/* One ConnectBank at a fixed position in both states: saving the first
            bank's mapping re-renders this page (server-action revalidation), and
            a remount here would drop the mapping overlay before it can show a
            "first sync didn't finish" warning. A phone shows it full width
            under the cards; desktop lifts it into the header's action slot. */}
        <div className="md:absolute md:right-[104px] md:top-[42px]">
          <ConnectBank
            accounts={budgtsAccounts}
            label={banks.length === 0 ? "Connect a bank" : "Connect another bank"}
            fullWidth
            buttonClassName="md:w-auto"
          />
        </div>
      </div>
    </>
  );
}
