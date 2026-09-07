import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { monthKey } from "@/lib/budget/month";
import { AddTransaction } from "@/components/add-transaction";
import { TransactionList, type TxnListItem } from "@/components/transaction-list";
import type { AccountOption, CategoryOption } from "@/components/transaction-form";

export const metadata: Metadata = { title: "Transactions" };

const MONTH_RE = /^\d{4}-\d{2}$/;

function monthBounds(m: string) {
  const [y, mm] = m.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, mm - 1, 1)).toISOString(),
    end: new Date(Date.UTC(y, mm, 1)).toISOString(),
    prev: monthKey(new Date(Date.UTC(y, mm - 2, 1))),
    next: monthKey(new Date(Date.UTC(y, mm, 1))),
    label: new Date(Date.UTC(y, mm - 1, 1)).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    todayInMonth: monthKey(new Date()) === m ? monthKey(new Date()) : `${m}-15`,
  };
}

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const sp = await searchParams;
  const m = typeof sp.m === "string" && MONTH_RE.test(sp.m) ? sp.m : monthKey(new Date());
  const { start, end, prev, next, label } = monthBounds(m);
  const defaultDate = (monthKey(new Date()) === m ? new Date().toISOString() : `${m}-15T12:00:00Z`).slice(0, 10);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [{ data: txns }, { data: accounts }, { data: categories }, { data: profile }] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "id, amount, direction, occurred_at, description, note, is_transfer, category_id, account_id, category:categories(name,color), account:accounts(name)",
      )
      .gte("occurred_at", start)
      .lt("occurred_at", end)
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
          <Link href={`/transactions?m=${prev}`} className="px-2 py-1 text-sm opacity-60 hover:opacity-100" aria-label="Previous month">
            ‹
          </Link>
          <h1 className="min-w-[9ch] text-center text-base font-semibold">{label}</h1>
          <Link href={`/transactions?m=${next}`} className="px-2 py-1 text-sm opacity-60 hover:opacity-100" aria-label="Next month">
            ›
          </Link>
        </div>
        <AddTransaction accounts={accountOpts} categories={categoryOpts} defaultDate={defaultDate} />
      </div>

      <TransactionList
        items={(txns ?? []) as unknown as TxnListItem[]}
        currency={currency}
        accounts={accountOpts}
        categories={categoryOpts}
      />
    </div>
  );
}
