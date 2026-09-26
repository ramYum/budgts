import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { currentMonthKey, todayDateKey } from "@/lib/budget/month";
import { AddTransaction } from "@/components/add-transaction";
import { MonthNav } from "@/components/month-nav";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/icon";
import { IconTile } from "@/components/ui";
import { TransactionList, type TxnListItem } from "@/components/transaction-list";
import type { AccountOption, CategoryOption } from "@/components/transaction-form";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { applyNeedsCategoryFilter } from "@/lib/plaid/needs-category-window";
import { STANDARD_CATEGORIES } from "@/lib/categories/standard";
import { ConnectBank } from "@/components/plaid/connect-bank";
import { NeedsCategory, type NeedsCategoryItem } from "@/components/plaid/needs-category";
import { LimitedHistoryBanner } from "@/components/plaid/limited-history-banner";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { selectableAccounts, type SelectableAccountRow } from "@/lib/accounts/selectable-accounts";
import { nudgeRefresh } from "@/server/plaid/service";
import { buildCategoryLookup, suggestPlaidCategory } from "@/lib/plaid/category-map";

export const metadata: Metadata = { title: "Transactions" };

const MONTH_RE = /^\d{4}-\d{2}$/;

function monthBounds(m: string) {
  const [y, mm] = m.split("-").map(Number);
  const first = new Date(Date.UTC(y, mm - 1, 1));
  const nextFirst = new Date(Date.UTC(y, mm, 1));
  return {
    start: first.toISOString(),
    end: nextFirst.toISOString(),
  };
}

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const sp = await searchParams;
  const m = typeof sp.m === "string" && MONTH_RE.test(sp.m) ? sp.m : currentMonthKey();
  const { start, end } = monthBounds(m);
  const defaultDate = currentMonthKey() === m ? todayDateKey() : `${m}-15`;
  const categoryFilter =
    typeof sp.category === "string" && /^[0-9a-f-]{36}$/i.test(sp.category) ? sp.category : null;

  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const supabase = await createClient();

  const plaidOn = plaidUiEnabled();

  // Nudge Plaid to check for new data now that the user is looking, without
  // holding up the response — see nudgeRefresh's docstring for the throttle.
  if (plaidOn) after(() => nudgeRefresh(user.id));

  // fetchAllRows, not a bare await: an unbounded `.select()` silently caps
  // at PostgREST's default 1000 rows, which a heavy Plaid feed can exceed
  // within a single month — see fetch-all-rows.ts. Keeps the intended
  // newest-first display order (occurred_at, created_at) and adds `id` as
  // a final tiebreaker so pagination across pages is deterministic.
  const txnsPromise = fetchAllRows((from, to, count) => {
    let q = supabase
      .from("transactions")
      .select(
        "id, amount, direction, occurred_at, description, note, is_transfer, category_id, account_id, category:categories(name,color), account:accounts!inner(name, is_archived)",
        { count },
      )
      .gte("occurred_at", start)
      .lt("occurred_at", end)
      // An archived account (closed manually, or left behind by an explicit
      // bank disconnect — see below) stays in the database forever, same as
      // a confirmed duplicate: never deleted, still in CSV export, just not
      // cluttering the default ledger view.
      .eq("account.is_archived", false);
    if (categoryFilter) q = q.eq("category_id", categoryFilter);
    // A soft-deleted bank row (Plaid `removed`) is not a transaction — keep it out
    // of the ledger view. Guarded: the column only exists where 0004 has run.
    if (plaidOn) q = q.is("removed_at", null);
    // A confirmed duplicate (design: 2026-09-12 Phase 15) stays in the database
    // forever — never deleted, still in CSV export — but the default ledger
    // view shouldn't show 50 copies of the same purchase. Same reasoning
    // needsCategory below already applies. Guarded like removed_at: the
    // column only exists where 0007 has run.
    if (plaidOn) q = q.is("duplicate_of_id", null);
    // An explicitly disconnected bank (design §24, disconnect.ts) never
    // deletes its transactions — plaid_account_id just goes null (the FK's
    // ON DELETE SET NULL) — but the ledger view shouldn't keep showing a
    // connection the owner deliberately removed. Scoped to `source = bank`
    // only: a manual entry's plaid_account_id is always null too, and must
    // never be caught by this. Deliberately NOT triggered by a transient
    // sync failure (login_required/error) — the item row, and so
    // plaid_account_id, is untouched until an actual disconnect.
    if (plaidOn) q = q.or("source.neq.bank,plaid_account_id.not.is.null");
    return q
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
  });

  const profilePromise = supabase.from("profiles").select("currency, created_at").eq("id", user.id).single();

  // Imported bank rows with no category, inside the user's categorization
  // window — the one prompt V1 shows (design §3; window: 2026-09-16 Advancial
  // follow-up). Newest first within that window: it's a to-do list scoped to
  // signup-month-day-1 through signup date, not a month view and not the
  // full recall history. Grouped by merchant in the component, so this cap is
  // against raw rows, not the (much smaller) number of unique merchants a
  // person actually has to act on. Same predicate as the header bell —
  // applied by the same shared function so the two can't drift. Chained off
  // the profile (it needs created_at) so it runs alongside the other reads
  // instead of after them.
  const needsCategoryPromise = profilePromise.then(async ({ data: p }) => {
    if (!plaidOn || !p?.created_at) return null;
    const { data } = await applyNeedsCategoryFilter(
      supabase.from("transactions").select(
        "id, description, merchant_name, merchant_entity_id, amount, direction, occurred_at, pending, plaid_category_primary, plaid_category_detailed, account:accounts(name)",
      ),
      p.created_at,
    )
      .order("occurred_at", { ascending: false })
      .limit(500);
    return data;
  });

  const [txns, { data: accounts }, { data: liveLinkedAccounts }, { data: categories }, { data: profile }, nc] =
    await Promise.all([
      txnsPromise,
      supabase.from("accounts").select("id, name, source").eq("is_archived", false).order("name"),
      // See src/lib/accounts/selectable-accounts.ts — a disconnected bank's
      // leftover account row must not show in the manual "Add" dropdown.
      plaidOn
        ? supabase.from("plaid_accounts").select("account_id").not("account_id", "is", null)
        : Promise.resolve({ data: [] as { account_id: string | null }[] }),
      supabase.from("categories").select("id, name, kind").eq("is_archived", false).order("kind").order("name"),
      profilePromise,
      needsCategoryPromise,
    ]);

  const currency = profile?.currency ?? "USD";
  const liveLinkedAccountIds = new Set(
    (liveLinkedAccounts ?? []).map((a) => a.account_id).filter((id): id is string => id != null),
  );
  const accountOpts: AccountOption[] = selectableAccounts(
    (accounts ?? []) as SelectableAccountRow[],
    liveLinkedAccountIds,
  );
  const categoryOpts = (categories ?? []) as CategoryOption[];

  let needsCategory: NeedsCategoryItem[] = [];
  if (nc) {
    const categoryLookup = buildCategoryLookup(categoryOpts.map((c) => [c.name, c.id] as const));
    needsCategory = (nc ?? []).map((r) => {
      const acc = r.account as { name: string | null } | { name: string | null }[] | null;
      const accountName = Array.isArray(acc) ? (acc[0]?.name ?? null) : (acc?.name ?? null);
      const primary = (r.plaid_category_primary as string | null) ?? null;
      const detailed = (r.plaid_category_detailed as string | null) ?? null;
      return {
        id: r.id as string,
        description: (r.description as string | null) ?? "",
        merchant_name: (r.merchant_name as string | null) ?? null,
        merchant_entity_id: (r.merchant_entity_id as string | null) ?? null,
        amount: r.amount as number,
        direction: r.direction as "debit" | "credit",
        occurred_at: r.occurred_at as string,
        account_name: accountName,
        pending: r.pending as boolean,
        plaid_category_primary: primary,
        suggested_category_id: suggestPlaidCategory(primary, detailed, categoryLookup),
      };
    });
  }

  // Standard categories the user doesn't currently have — offered in the
  // "Needs a category" picker as "add this one" (auto-created on pick).
  const haveNames = new Set(categoryOpts.map((c) => c.name));
  const missingStandard = STANDARD_CATEGORIES.map((c) => c.name).filter((n) => !haveNames.has(n));

  const showConnectPrompt = plaidOn && (txns ?? []).length === 0 && !categoryFilter;

  const hasPanel = needsCategory.length > 0;

  return (
    <div>
      <PageHeader
        title="Activity"
        month={<MonthNav base="/transactions" month={m} />}
        action={<AddTransaction accounts={accountOpts} categories={categoryOpts} defaultDate={defaultDate} />}
      />

      {/* Streams in: its per-account lookups never hold up the ledger. */}
      <Suspense fallback={null}>
        <LimitedHistoryBanner />
      </Suspense>

      {categoryFilter ? (
        <div className="px-band mb-6 flex items-center justify-between gap-3 px-2 py-1 text-[15px] leading-6 text-ink">
          <span className="flex min-w-0 items-center gap-2">
            <Icon name="categories" className="text-graphite" />
            <span className="truncate">
              Showing{" "}
              <span className="font-semibold">
                {categoryOpts.find((c) => c.id === categoryFilter)?.name ?? "category"}
              </span>
            </span>
          </span>
          <Link
            href={`/transactions?m=${m}`}
            className="press -my-1 flex shrink-0 items-center gap-1 font-medium text-graphite hover:text-ink"
          >
            Clear
            <Icon name="close" />
          </Link>
        </div>
      ) : null}

      {/* Phones: the to-do panel leads, above the list. Wide screens: it
          takes the right-hand column beside the ledger. */}
      <div
        className={
          hasPanel ? "flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start" : "space-y-6"
        }
      >
        {hasPanel ? (
          <div className="xl:col-start-2 xl:row-start-1">
            <NeedsCategory
              items={needsCategory}
              categories={categoryOpts}
              missingStandard={missingStandard}
              currency={currency}
            />
          </div>
        ) : null}

        <div className="min-w-0 space-y-6 xl:col-start-1 xl:row-start-1">
          {showConnectPrompt ? (
            <div className="px-card flex flex-col items-start gap-3 p-3 sm:flex-row sm:items-center md:p-4">
              <IconTile name="bank" />
              <p className="flex-1 text-[15px] leading-6 text-graphite">
                Connect a bank to fill this in on its own, or add a transaction by hand.
              </p>
              <ConnectBank accounts={accountOpts} tone="outline" />
            </div>
          ) : null}

          <TransactionList
            items={(txns ?? []) as unknown as TxnListItem[]}
            currency={currency}
            accounts={accountOpts}
            categories={categoryOpts}
          />
        </div>
      </div>
    </div>
  );
}
