import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { monthKey } from "@/lib/budget/month";
import { AddTransaction } from "@/components/add-transaction";
import { TransactionList, type TxnListItem } from "@/components/transaction-list";
import type { AccountOption, CategoryOption } from "@/components/transaction-form";

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

  let txnQuery = supabase
    .from("transactions")
    .select(
      "id, amount, direction, occurred_at, description, note, is_transfer, category_id, account_id, category:categories(name,color), account:accounts(name)",
    )
    .gte("occurred_at", start)
    .lt("occurred_at", end);
  if (categoryFilter) txnQuery = txnQuery.eq("category_id", categoryFilter);

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

  return (
    <div className="space-y-4 pt-2">
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
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
          <span>
            Showing{" "}
            <span className="font-medium">
              {categoryOpts.find((c) => c.id === categoryFilter)?.name ?? "category"}
            </span>
          </span>
          <Link href={`/transactions?m=${m}`} className="text-xs text-muted hover:text-text">
            Clear
          </Link>
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
