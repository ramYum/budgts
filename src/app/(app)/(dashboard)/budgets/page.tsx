import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildDashboard, type DashboardCategory } from "@/lib/budget/dashboard";
import { monthlyActuals } from "@/lib/budget/actuals";
import { monthKey } from "@/lib/budget/month";
import type { BudgetTxn } from "@/lib/budget/types";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { isEventRole } from "@/lib/plaid/event-role";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { BudgetsView, type AllTimeRow } from "@/components/budgets-view";

export const metadata: Metadata = { title: "Budgets" };

const MONTH_RE = /^\d{4}-\d{2}$/;

function monthRangeOf(m: string) {
  const [y, mm] = m.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, mm - 1, 1)).toISOString(),
    end: new Date(Date.UTC(y, mm, 1)).toISOString(),
  };
}

function prevMonthKey(m: string): string {
  const [y, mm] = m.split("-").map(Number);
  return monthKey(new Date(Date.UTC(y, mm - 2, 1)));
}

type TxnRow = Pick<
  Database["public"]["Tables"]["transactions"]["Row"],
  | "category_id"
  | "amount"
  | "direction"
  | "occurred_at"
  | "status"
  | "is_transfer"
  | "duplicate_of_id"
  | "event_role"
  | "transfer_user_set"
  | "plaid_account_id"
>;

export default async function BudgetsPage({ searchParams }: PageProps<"/budgets">) {
  const sp = await searchParams;
  const month = typeof sp.m === "string" && MONTH_RE.test(sp.m) ? sp.m : monthKey(new Date());
  const range = sp.range === "all" ? "all" : "month";

  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();
  const plaidOn = plaidUiEnabled();

  const { data: excludedPlaidAccounts } = plaidOn
    ? await supabase.from("plaid_accounts").select("id").eq("excluded_from_calculations", true)
    : { data: [] as { id: string }[] };
  const excludedPlaidAccountIds = new Set((excludedPlaidAccounts ?? []).map((a) => a.id));

  const toBudgetTxn = (t: TxnRow): BudgetTxn => ({
    categoryId: t.category_id,
    amount: t.amount,
    direction: t.direction,
    occurredAt: new Date(t.occurred_at),
    status: t.status,
    isTransfer: t.is_transfer,
    duplicateOfId: t.duplicate_of_id,
    eventRole: t.event_role != null && isEventRole(t.event_role) ? t.event_role : null,
    transferUserSet: t.transfer_user_set,
    accountExcluded: t.plaid_account_id != null && excludedPlaidAccountIds.has(t.plaid_account_id),
  });

  const cols =
    "category_id, amount, direction, occurred_at, status, is_transfer, duplicate_of_id, event_role, transfer_user_set, plaid_account_id";

  const [{ data: categories }, { data: profile }] = await Promise.all([
    supabase.from("categories").select("id, kind, name, color").eq("is_archived", false).order("name"),
    supabase.from("profiles").select("currency").eq("id", user.id).single(),
  ]);
  const cats: DashboardCategory[] = (categories ?? []) as DashboardCategory[];
  const currency = profile?.currency ?? "USD";

  if (range === "all") {
    // fetchAllRows, not a bare await: unbounded (no date filter — this is
    // the user's ENTIRE history), so it's the query most at risk of
    // PostgREST's default 1000-row cap. See fetch-all-rows.ts.
    const allRows = await fetchAllRows((from, to) => {
      let q = supabase
        .from("transactions")
        .select(cols)
        .order("id", { ascending: true })
        .range(from, to);
      if (plaidOn) q = q.is("removed_at", null);
      return q.returns<TxnRow[]>();
    });
    const allTxns = allRows.map(toBudgetTxn);

    const months = new Set(allTxns.map((t) => monthKey(t.occurredAt)));
    const totals = new Map<string, number>();
    for (const mk of months) {
      const actuals = monthlyActuals(allTxns, mk);
      for (const c of cats.filter((c) => c.kind === "expense")) {
        totals.set(c.id, (totals.get(c.id) ?? 0) + Math.max(0, actuals.get(c.id) ?? 0));
      }
    }
    const rows: AllTimeRow[] = cats
      .filter((c) => c.kind === "expense")
      .map((c) => ({ categoryId: c.id, name: c.name, color: c.color, total: totals.get(c.id) ?? 0 }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);

    return (
      <div className="pt-1">
        <BudgetsView range="all" month={month} currency={currency} allTimeRows={rows} categories={cats} />
      </div>
    );
  }

  const { start, end } = monthRangeOf(month);
  const prevMonth = prevMonthKey(month);
  const { start: prevStart, end: prevEnd } = monthRangeOf(prevMonth);

  const txnPage = (gte: string, lt: string) => (from: number, to: number) => {
    let q = supabase.from("transactions").select(cols).gte("occurred_at", gte).lt("occurred_at", lt);
    q = q.order("id", { ascending: true }).range(from, to);
    if (plaidOn) q = q.is("removed_at", null);
    return q.returns<TxnRow[]>();
  };

  const [curRows, prevRows, { data: budgetRows }] = await Promise.all([
    fetchAllRows(txnPage(start, end)),
    fetchAllRows(txnPage(prevStart, prevEnd)),
    supabase.from("budgets").select("category_id, amount").eq("month", `${month}-01`),
  ]);

  const budgets = (budgetRows ?? []).map((b) => ({ categoryId: b.category_id, amount: b.amount }));
  const view = buildDashboard(curRows.map(toBudgetTxn), cats, budgets, month);
  const prevView = buildDashboard(prevRows.map(toBudgetTxn), cats, [], prevMonth);

  const unbudgeted = cats.filter(
    (c) => c.kind === "expense" && !view.bars.some((b) => b.categoryId === c.id && b.budget > 0),
  );

  return (
    <div className="pt-1">
      <RealtimeRefresh tables={["budgets"]} />
      <BudgetsView
        range="month"
        month={month}
        currency={currency}
        view={view}
        prevView={prevView}
        categories={cats}
        unbudgetedCategories={unbudgeted}
      />
    </div>
  );
}
