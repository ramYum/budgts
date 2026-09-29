/**
 * Insights' data ("What can I change to save more?", design spec §24-26): the month's and the previous month's
 * budget-vs-actual, the six-month spending trend, and the month's income by source. It composes the same pure
 * `buildDashboard` / `monthlyActuals` / `spendTrend` functions Home and Budgets use; no new financial semantics.
 *
 * One implementation, used by the web Insights page (`src/app/(app)/(dashboard)/insights/page.tsx`) and the native
 * `GET /api/mobile/insights`, so the two can never disagree. Moved verbatim out of the web page (2026-09-29, Stage 2B).
 * Framework-free: the caller supplies the Supabase client (RLS scopes it to the user), the user's time zone (which decides
 * "this month") and whether Plaid is on. `degraded` names every side query that failed; the web page renders as it always
 * has, the native route refuses to serve partial numbers. A failed transactions read throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDashboard, type DashboardCategory, type DashboardView } from "@/lib/budget/dashboard";
import { monthlyActuals } from "@/lib/budget/actuals";
import { currentMonthKey, monthKey } from "@/lib/budget/month";
import { priorMonths, spendTrend, type MonthSpend } from "@/lib/budget/spend-trend";
import type { BudgetTxn } from "@/lib/budget/types";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { isEventRole } from "@/lib/plaid/event-role";

export type IncomeSource = { name: string; color: string; amount: number };

export type InsightsData = {
  month: string;
  currency: string;
  current: DashboardView;
  previous: DashboardView;
  trend: MonthSpend[];
  incomeSources: IncomeSource[];
  /** The side queries that failed (empty when every read succeeded). */
  degraded: string[];
};

export type LoadInsightsInput = {
  userId: string;
  timeZone: string;
  /** `YYYY-MM`; the user's current month when absent. */
  month?: string;
  plaidEnabled: boolean;
};

function prevMonthKey(m: string): string {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm - 2, 1));
  return monthKey(d);
}

function monthRange(m: string) {
  const [y, mm] = m.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, mm - 1, 1)).toISOString(),
    end: new Date(Date.UTC(y, mm, 1)).toISOString(),
  };
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

/** Mirrors the dashboard page's own query + qualification columns exactly
 * (same `event_role`/`transfer_user_set`/account-exclusion handling) so
 * Insights can never disagree with Home for the same month. One window
 * [start, end) covers the six-month trend; the months are sliced from it. */
async function loadRange(
  supabase: SupabaseClient,
  start: string,
  end: string,
  plaidOn: boolean,
  excludedPlaidAccountIdsPromise: Promise<Set<string>>,
): Promise<BudgetTxn[]> {
  // fetchAllRows, not a bare await — see fetch-all-rows.ts: an unbounded
  // `.select()` silently caps at 1000 rows, which a heavy Plaid feed can
  // exceed within a single month.
  const dataPromise = fetchAllRows((from, to, count) => {
    let q = supabase
      .from("transactions")
      .select(
        "category_id, amount, direction, occurred_at, status, is_transfer, duplicate_of_id, event_role, transfer_user_set, plaid_account_id",
        { count },
      )
      .gte("occurred_at", start)
      .lt("occurred_at", end)
      .order("id", { ascending: true })
      .range(from, to);
    if (plaidOn) q = q.is("removed_at", null);
    return q.returns<TxnRow[]>();
  });
  // The exclusion set only matters for mapping, so the row fetch doesn't wait on it.
  const [data, excludedPlaidAccountIds] = await Promise.all([dataPromise, excludedPlaidAccountIdsPromise]);
  return data.map((t) => ({
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
  }));
}

export async function loadInsights(supabase: SupabaseClient, input: LoadInsightsInput): Promise<InsightsData> {
  const { userId, timeZone, plaidEnabled } = input;
  const month = input.month ?? currentMonthKey(timeZone);
  const prev = prevMonthKey(month);
  const degraded: string[] = [];

  const excludedPlaidAccountIds = (async () => {
    if (!plaidEnabled) return new Set<string>();
    const { data, error } = await supabase.from("plaid_accounts").select("id").eq("excluded_from_calculations", true);
    if (error) degraded.push("excludedAccounts");
    return new Set(((data ?? []) as { id: string }[]).map((a) => a.id));
  })();

  // One parallel round: the month loads no longer wait for the lookups above.
  // The trend card's six months, oldest first; this month and last month are
  // slices of the same rows, exactly as Home does it.
  const trendMonths = priorMonths(month, 6);
  const { start: windowStart } = monthRange(trendMonths[0]!);
  const { start, end } = monthRange(month);
  const { start: prevStart, end: prevEnd } = monthRange(prev);

  const [categoriesRes, budgetsRes, profileRes, windowTxns] = await Promise.all([
    supabase.from("categories").select("id, kind, name, color").eq("is_archived", false),
    supabase.from("budgets").select("category_id, amount").eq("month", `${month}-01`),
    supabase.from("profiles").select("currency").eq("id", userId).single(),
    loadRange(supabase, windowStart, end, plaidEnabled, excludedPlaidAccountIds),
  ]);
  if (categoriesRes.error) degraded.push("categories");
  if (budgetsRes.error) degraded.push("budgets");
  if (profileRes.error) degraded.push("profile");

  const inRange = (t: BudgetTxn, from: string, to: string) =>
    t.occurredAt.getTime() >= Date.parse(from) && t.occurredAt.getTime() < Date.parse(to);
  const currentTxns = windowTxns.filter((t) => inRange(t, start, end));
  const prevTxns = windowTxns.filter((t) => inRange(t, prevStart, prevEnd));

  const cats: DashboardCategory[] = (categoriesRes.data ?? []) as DashboardCategory[];
  const budgets = ((budgetsRes.data ?? []) as { category_id: string; amount: number }[]).map((b) => ({
    categoryId: b.category_id,
    amount: b.amount,
  }));

  const current = buildDashboard(currentTxns, cats, budgets, month);
  const previous = buildDashboard(prevTxns, cats, [], prev);
  const trend = spendTrend(windowTxns, cats, trendMonths);

  const incomeCategories = cats.filter((c) => c.kind === "income");
  const currentIncomeByCategory = monthlyActuals(currentTxns, month);
  const incomeSources = incomeCategories
    .map((c) => ({ name: c.name, color: c.color, amount: Math.max(0, -(currentIncomeByCategory.get(c.id) ?? 0)) }))
    .filter((s) => s.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return {
    month,
    currency: (profileRes.data as { currency: string } | null)?.currency ?? "USD",
    current,
    previous,
    trend,
    incomeSources,
    degraded,
  };
}
