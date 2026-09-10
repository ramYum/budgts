import { redirect } from "next/navigation";
import { buildDashboard, type DashboardCategory } from "@/lib/budget/dashboard";
import { monthKey } from "@/lib/budget/month";
import type { BudgetTxn } from "@/lib/budget/types";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { DashboardView } from "@/components/dashboard-view";
import { RealtimeRefresh } from "@/components/realtime-refresh";

const MONTH_RE = /^\d{4}-\d{2}$/;

function monthRange(m: string) {
  const [y, mm] = m.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, mm - 1, 1)).toISOString(),
    end: new Date(Date.UTC(y, mm, 1)).toISOString(),
  };
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const month = typeof sp.m === "string" && MONTH_RE.test(sp.m) ? sp.m : monthKey(new Date());
  const { start, end } = monthRange(month);

  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();

  let txnQuery = supabase
    .from("transactions")
    .select("category_id, amount, direction, occurred_at, status, is_transfer")
    .gte("occurred_at", start)
    .lt("occurred_at", end);
  // Soft-deleted bank rows (Plaid `removed`) must not count toward spend.
  // Guarded: the column only exists where migration 0004 has run.
  if (plaidUiEnabled()) txnQuery = txnQuery.is("removed_at", null);

  const [{ data: txnRows }, { data: categories }, { data: budgetRows }, { data: profile }] =
    await Promise.all([
      txnQuery,
      supabase
        .from("categories")
        .select("id, kind, name, color")
        .eq("is_archived", false),
      supabase.from("budgets").select("category_id, amount").eq("month", `${month}-01`),
      supabase.from("profiles").select("currency").eq("id", user.id).single(),
    ]);

  const txns: BudgetTxn[] = (txnRows ?? []).map((t) => ({
    categoryId: t.category_id,
    amount: t.amount,
    direction: t.direction,
    occurredAt: new Date(t.occurred_at),
    status: t.status,
    isTransfer: t.is_transfer,
  }));
  const cats: DashboardCategory[] = (categories ?? []) as DashboardCategory[];
  const budgets = (budgetRows ?? []).map((b) => ({ categoryId: b.category_id, amount: b.amount }));

  const view = buildDashboard(txns, cats, budgets, month);

  return (
    <div className="pb-2">
      <RealtimeRefresh tables={["transactions", "budgets"]} />
      <DashboardView view={view} currency={profile?.currency ?? "USD"} month={month} />
    </div>
  );
}
