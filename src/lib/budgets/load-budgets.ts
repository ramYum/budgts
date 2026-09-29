/**
 * The Budgets screen's data: budget-vs-actual for a month (with last month's actuals beside it), or every expense
 * category's all-time spending. It composes the same pure `buildDashboard` / `monthlyActuals` functions Home and Insights
 * use; no formula lives here.
 *
 * One implementation, used by the web Budgets page (`src/app/(app)/(dashboard)/budgets/page.tsx`) and the native
 * `GET /api/mobile/budgets`, so the two can never disagree. Moved verbatim out of the web page (2026-09-29, Stage 2B).
 * Framework-free: the caller supplies the Supabase client (RLS scopes it to the user), the user's time zone and whether
 * Plaid is on. `degraded` names every side query that failed (the native route refuses partial numbers); a failed
 * transactions read throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDashboard, type DashboardCategory, type DashboardView } from "@/lib/budget/dashboard";
import { monthlyActuals } from "@/lib/budget/actuals";
import { currentMonthKey, monthKey } from "@/lib/budget/month";
import type { BudgetTxn } from "@/lib/budget/types";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAllRows, type RowCount } from "@/lib/supabase/fetch-all-rows";
import { isEventRole } from "@/lib/plaid/event-role";

export type AllTimeRow = { categoryId: string; name: string; color: string; total: number };

type Common = { month: string; currency: string; categories: DashboardCategory[]; degraded: string[] };

export type BudgetsMonthData = Common & {
  range: "month";
  view: DashboardView;
  prevView: DashboardView;
  /** Expense categories with no budget above zero this month (what "Add a budget" offers). */
  unbudgeted: DashboardCategory[];
};

export type BudgetsAllTimeData = Common & { range: "all"; allTimeRows: AllTimeRow[] };

export type BudgetsData = BudgetsMonthData | BudgetsAllTimeData;

export type LoadBudgetsInput = {
  userId: string;
  timeZone: string;
  /** `YYYY-MM`; the user's current month when absent. */
  month?: string;
  range: "month" | "all";
  plaidEnabled: boolean;
};

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

export async function loadBudgets(supabase: SupabaseClient, input: LoadBudgetsInput): Promise<BudgetsData> {
  const { userId, range, plaidEnabled: plaidOn } = input;
  const month = input.month ?? currentMonthKey(input.timeZone);

  const cols =
    "category_id, amount, direction, occurred_at, status, is_transfer, duplicate_of_id, event_role, transfer_user_set, plaid_account_id";

  // Every read below is independent, so they all start now and run together
  // (the page used to await excluded accounts, then categories/profile, then
  // transactions — three serial round trips).
  const txnPage = (gte: string | null, lt: string | null) => (from: number, to: number, count: RowCount) => {
    let q = supabase.from("transactions").select(cols, { count });
    if (gte) q = q.gte("occurred_at", gte);
    if (lt) q = q.lt("occurred_at", lt);
    q = q.order("id", { ascending: true }).range(from, to);
    if (plaidOn) q = q.is("removed_at", null);
    return q.returns<TxnRow[]>();
  };
  const { start, end } = monthRangeOf(month);
  const prevMonth = prevMonthKey(month);
  const { start: prevStart, end: prevEnd } = monthRangeOf(prevMonth);
  // fetchAllRows, not a bare await: "all" is unbounded (no date filter — the
  // user's ENTIRE history), so it's the query most at risk of PostgREST's
  // default 1000-row cap. See fetch-all-rows.ts.
  const txnRowsPromise =
    range === "all"
      ? Promise.all([fetchAllRows(txnPage(null, null)), Promise.resolve([] as TxnRow[])])
      : Promise.all([fetchAllRows(txnPage(start, end)), fetchAllRows(txnPage(prevStart, prevEnd))]);

  const [excludedRes, categoriesRes, profileRes, budgetsRes, [curRows, prevRows]] = await Promise.all([
    plaidOn
      ? supabase.from("plaid_accounts").select("id").eq("excluded_from_calculations", true)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
    supabase.from("categories").select("id, kind, name, color").eq("is_archived", false).order("name"),
    supabase.from("profiles").select("currency").eq("id", userId).single(),
    range === "all"
      ? Promise.resolve({ data: [] as { category_id: string; amount: number }[], error: null })
      : supabase.from("budgets").select("category_id, amount").eq("month", `${month}-01`),
    txnRowsPromise,
  ]);
  const degraded = Object.entries({
    excludedAccounts: excludedRes.error,
    categories: categoriesRes.error,
    profile: profileRes.error,
    budgets: budgetsRes.error,
  })
    .filter(([, error]) => error != null)
    .map(([name]) => name);
  const excludedPlaidAccountIds = new Set(((excludedRes.data ?? []) as { id: string }[]).map((a) => a.id));

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

  const cats: DashboardCategory[] = (categoriesRes.data ?? []) as DashboardCategory[];
  const currency = (profileRes.data as { currency: string } | null)?.currency ?? "USD";

  if (range === "all") {
    const allTxns = curRows.map(toBudgetTxn);

    const months = new Set(allTxns.map((t) => monthKey(t.occurredAt)));
    const totals = new Map<string, number>();
    for (const mk of months) {
      const actuals = monthlyActuals(allTxns, mk);
      for (const c of cats.filter((c) => c.kind === "expense")) {
        totals.set(c.id, (totals.get(c.id) ?? 0) + Math.max(0, actuals.get(c.id) ?? 0));
      }
    }
    const allTimeRows: AllTimeRow[] = cats
      .filter((c) => c.kind === "expense")
      .map((c) => ({ categoryId: c.id, name: c.name, color: c.color, total: totals.get(c.id) ?? 0 }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);

    return { range: "all", month, currency, categories: cats, allTimeRows, degraded };
  }

  const budgets = ((budgetsRes.data ?? []) as { category_id: string; amount: number }[]).map((b) => ({
    categoryId: b.category_id,
    amount: b.amount,
  }));
  const view = buildDashboard(curRows.map(toBudgetTxn), cats, budgets, month);
  const prevView = buildDashboard(prevRows.map(toBudgetTxn), cats, [], prevMonth);

  const unbudgeted = cats.filter(
    (c) => c.kind === "expense" && !view.bars.some((b) => b.categoryId === c.id && b.budget > 0),
  );

  return { range: "month", month, currency, categories: cats, view, prevView, unbudgeted, degraded };
}
