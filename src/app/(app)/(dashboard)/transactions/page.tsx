import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { monthKey } from "@/lib/budget/month";
import { AddTransaction } from "@/components/add-transaction";
import { TransactionList, type TxnListItem } from "@/components/transaction-list";
import type { AccountOption, CategoryOption } from "@/components/transaction-form";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { STANDARD_CATEGORIES } from "@/lib/categories/standard";
import { ConnectBank } from "@/components/plaid/connect-bank";
import { NeedsCategory, type NeedsCategoryItem } from "@/components/plaid/needs-category";
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
    prev: monthKey(new Date(Date.UTC(y, mm - 2, 1))),
    next: monthKey(nextFirst),
    label: first.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const sp = await searchParams;
  const m = typeof sp.m === "string" && MONTH_RE.test(sp.m) ? sp.m : monthKey(new Date());
  const { start, end, prev, next, label } = monthBounds(m);
  const defaultDate = (monthKey(new Date()) === m ? new Date().toISOString() : `${m}-15T12:00:00Z`).slice(0, 10);
  const categoryFilter =
    typeof sp.category === "string" && /^[0-9a-f-]{36}$/i.test(sp.category) ? sp.category : null;

  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const supabase = await createClient();

  const plaidOn = plaidUiEnabled();

  // Nudge Plaid to check for new data now that the user is looking, without
  // holding up the response — see nudgeRefresh's docstring for the throttle.
  if (plaidOn) after(() => nudgeRefresh(user.id));

  let txnQuery = supabase
    .from("transactions")
    .select(
      "id, amount, direction, occurred_at, description, note, is_transfer, category_id, account_id, category:categories(name,color), account:accounts(name)",
    )
    .gte("occurred_at", start)
    .lt("occurred_at", end);
  if (categoryFilter) txnQuery = txnQuery.eq("category_id", categoryFilter);
  // A soft-deleted bank row (Plaid `removed`) is not a transaction — keep it out
  // of the ledger view. Guarded: the column only exists where 0004 has run.
  if (plaidOn) txnQuery = txnQuery.is("removed_at", null);

  const [{ data: txns }, { data: accounts }, { data: categories }, { data: profile }] = await Promise.all([
    txnQuery
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("accounts").select("id, name").eq("is_archived", false).order("name"),
    supabase.from("categories").select("id, name, kind").eq("is_archived", false).order("kind").order("name"),
    supabase.from("profiles").select("currency").eq("id", user.id).single(),
  ]);

  const currency = profile?.currency ?? "USD";
  const accountOpts = (accounts ?? []) as AccountOption[];
  const categoryOpts = (categories ?? []) as CategoryOption[];

  // Imported bank rows with no category — the one prompt V1 shows (design §3).
  // All-time, newest first: it's a to-do list, not a month view. Grouped by
  // merchant in the component, so this cap is against raw rows, not the
  // (much smaller) number of unique merchants a person actually has to act on.
  let needsCategory: NeedsCategoryItem[] = [];
  if (plaidOn) {
    const { data: nc } = await supabase
      .from("transactions")
      .select(
        "id, description, merchant_name, merchant_entity_id, amount, direction, occurred_at, pending, plaid_category_primary, plaid_category_detailed, account:accounts(name)",
      )
      .eq("source", "bank")
      .is("category_id", null)
      .is("removed_at", null)
      .eq("is_transfer", false)
      // A confirmed duplicate (design: 2026-09-12 Phase 15) is never real work
      // to do — it doesn't route through countsForMonth, so it must be
      // excluded here explicitly.
      .is("duplicate_of_id", null)
      .order("occurred_at", { ascending: false })
      .limit(500);
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

  return (
    <div className="space-y-4 pt-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Link href={`/transactions?m=${prev}`} className="px-2 py-1 text-sm text-muted hover:text-text" aria-label="Previous month">
            ‹
          </Link>
          <h1 className="min-w-[9ch] text-center text-base font-semibold">{label}</h1>
          <Link href={`/transactions?m=${next}`} className="px-2 py-1 text-sm text-muted hover:text-text" aria-label="Next month">
            ›
          </Link>
        </div>
        <AddTransaction accounts={accountOpts} categories={categoryOpts} defaultDate={defaultDate} />
      </div>

      {categoryFilter ? (
        <div className="flex items-center justify-between rounded-lg border border-hairline bg-tint px-3 py-2 text-sm text-primary">
          <span>
            Showing{" "}
            <span className="font-semibold">
              {categoryOpts.find((c) => c.id === categoryFilter)?.name ?? "category"}
            </span>
          </span>
          <Link href={`/transactions?m=${m}`} className="text-xs font-medium text-primary/60 hover:text-primary">
            Clear
          </Link>
        </div>
      ) : null}

      <NeedsCategory
        items={needsCategory}
        categories={categoryOpts}
        missingStandard={missingStandard}
        currency={currency}
      />

      {showConnectPrompt ? (
        <div className="card space-y-3 rounded-2xl border border-hairline p-4">
          <p className="text-sm text-muted">
            Connect a bank to fill this in automatically, or add a transaction by hand.
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
  );
}
