/**
 * The Home dashboard's data path, factored out of the web Home page so the web
 * page and `GET /api/mobile/home` run exactly the same queries, filters and
 * domain calls — one authoritative implementation, no copy to drift.
 *
 * Server-side only, but framework-free: it takes an already-authenticated,
 * RLS-scoped Supabase client (the cookie client on web, a Bearer-token client
 * for mobile). It never chooses whose data to read — RLS does, from that
 * client's JWT — and it never uses the secret key.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDashboard, type DashboardCategory, type DashboardView } from "@/lib/budget/dashboard";
import { monthKey, type MonthKey } from "@/lib/budget/month";
import { priorMonths, spendTrend, type MonthSpend } from "@/lib/budget/spend-trend";
import {
  goalsSummary,
  type GoalsSummary,
  type SavingsContribution,
  type SavingsGoal,
} from "@/lib/budget/savings";
import type { BudgetTxn } from "@/lib/budget/types";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { isEventRole } from "@/lib/plaid/event-role";

function monthRange(m: string) {
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

export type MonthlyDashboard = {
  view: DashboardView;
  prevView: DashboardView;
  trend: MonthSpend[];
  savings: GoalsSummary;
  currency: string;
  categories: DashboardCategory[];
  /**
   * Names of the non-transaction queries that errored. The web page has always
   * rendered with whatever came back (unchanged); the mobile endpoint refuses
   * to serve partial financial numbers when this is non-empty. A transaction
   * query failure throws instead (see `fetchAllRows`).
   */
  degraded: string[];
};

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

const TXN_COLS =
  "category_id, amount, direction, occurred_at, status, is_transfer, duplicate_of_id, event_role, transfer_user_set, plaid_account_id";

export async function loadMonthlyDashboard(
  supabase: SupabaseClient,
  userId: string,
  month: MonthKey,
  plaidOn: boolean,
): Promise<MonthlyDashboard> {
  const { start, end } = monthRange(month);

  // fetchAllRows, not a bare await: an unbounded `.select()` silently caps
  // at PostgREST's default 1000 rows, and a heavy Plaid feed (a real,
  // confirmed case) can exceed that within a single month — see
  // fetch-all-rows.ts. Ordered by `id` (unique) so pagination across pages
  // is deterministic; a timestamp column here has many exact ties from
  // bulk-inserted sync batches.
  const txnPage = (gte: string, lt: string) => (from: number, to: number) => {
    let q = supabase
      .from("transactions")
      .select(TXN_COLS)
      .gte("occurred_at", gte)
      .lt("occurred_at", lt)
      .order("id", { ascending: true })
      .range(from, to);
    // Soft-deleted bank rows (Plaid `removed`) must not count toward spend.
    // Guarded: the column only exists where migration 0004 has run.
    if (plaidOn) q = q.is("removed_at", null);
    return q.returns<TxnRow[]>();
  };

  const prevMonth = prevMonthKey(month);
  const { start: prevStart, end: prevEnd } = monthRange(prevMonth);

  // Home's "Total spending" trend card — one bounded query covering the last
  // 6 months, then the same pure `rollup` Home/Budgets/Insights already use,
  // called once per month.
  const trendMonths = priorMonths(month, 6);
  const { start: trendStart } = monthRange(trendMonths[0]!);

  const [
    txnRows,
    prevTxnRows,
    trendTxnRows,
    categoriesRes,
    budgetsRes,
    profileRes,
    excludedRes,
    goalsRes,
    contribRes,
  ] = await Promise.all([
    fetchAllRows(txnPage(start, end)),
    fetchAllRows(txnPage(prevStart, prevEnd)),
    fetchAllRows(txnPage(trendStart, end)),
    supabase.from("categories").select("id, kind, name, color").eq("is_archived", false),
    supabase.from("budgets").select("category_id, amount").eq("month", `${month}-01`),
    supabase.from("profiles").select("currency").eq("id", userId).single(),
    // Explicit owner-excluded connections (design: 2026-09-13 Advancial
    // containment) — a Plaid account the owner has confirmed is unreliable.
    // Self-gates like the rest of the Plaid UI: an empty result under a
    // pre-migration DB is indistinguishable from "no exclusions," which is
    // the correct, safe default either way.
    plaidOn
      ? supabase.from("plaid_accounts").select("id").eq("excluded_from_calculations", true)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
    supabase
      .from("savings_goals")
      .select("id, name, target_amount, target_date, is_archived")
      .eq("is_archived", false)
      .order("created_at"),
    supabase.from("savings_contributions").select("goal_id, amount"),
  ]);

  const degraded: string[] = [];
  if (categoriesRes.error) degraded.push("categories");
  if (budgetsRes.error) degraded.push("budgets");
  if (profileRes.error) degraded.push("profile");
  if (excludedRes.error) degraded.push("plaid_accounts");
  if (goalsRes.error) degraded.push("savings_goals");
  if (contribRes.error) degraded.push("savings_contributions");

  const excludedPlaidAccountIds = new Set((excludedRes.data ?? []).map((a: { id: string }) => a.id));

  const toBudgetTxn = (t: TxnRow): BudgetTxn => ({
    categoryId: t.category_id,
    amount: t.amount,
    direction: t.direction,
    occurredAt: new Date(t.occurred_at),
    status: t.status,
    isTransfer: t.is_transfer,
    duplicateOfId: t.duplicate_of_id,
    // event_role is `text` (DB CHECK-constrained, not a real enum — see
    // database.types.ts), so it isn't already narrowed to EventRole here.
    // Same "never guess" boundary guard countsForMonth uses (design:
    // 2026-09-12 qualify-integration final review, Important #2).
    eventRole: t.event_role != null && isEventRole(t.event_role) ? t.event_role : null,
    transferUserSet: t.transfer_user_set,
    accountExcluded: t.plaid_account_id != null && excludedPlaidAccountIds.has(t.plaid_account_id),
  });

  const cats = (categoriesRes.data ?? []) as DashboardCategory[];
  const budgets = (budgetsRes.data ?? []).map((b: { category_id: string; amount: number }) => ({
    categoryId: b.category_id,
    amount: b.amount,
  }));

  const goals: SavingsGoal[] = (goalsRes.data ?? []).map(
    (g: { id: string; name: string; target_amount: number; target_date: string | null; is_archived: boolean }) => ({
      id: g.id,
      name: g.name,
      targetAmount: g.target_amount,
      targetDate: g.target_date,
      isArchived: g.is_archived,
    }),
  );
  const contributions: SavingsContribution[] = (contribRes.data ?? []).map(
    (c: { goal_id: string; amount: number }) => ({ goalId: c.goal_id, amount: c.amount }),
  );

  return {
    view: buildDashboard(txnRows.map(toBudgetTxn), cats, budgets, month),
    prevView: buildDashboard(prevTxnRows.map(toBudgetTxn), cats, [], prevMonth),
    trend: spendTrend(trendTxnRows.map(toBudgetTxn), cats, trendMonths),
    savings: goalsSummary(goals, contributions),
    currency: (profileRes.data as { currency?: string } | null)?.currency ?? "USD",
    categories: cats,
    degraded,
  };
}

export type RecentActivity = {
  id: string;
  amount: number;
  direction: "debit" | "credit";
  occurredAt: string;
  description: string;
  isTransfer: boolean;
  category: { name: string; color: string } | null;
};

/** The five most recent transactions — Home's "Recent activity". */
export async function loadRecentActivity(
  supabase: SupabaseClient,
  plaidOn: boolean,
): Promise<{ items: RecentActivity[]; failed: boolean }> {
  let q = supabase
    .from("transactions")
    .select("id, amount, direction, occurred_at, description, is_transfer, category:categories(name,color)")
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);
  if (plaidOn) q = q.is("removed_at", null);

  const { data, error } = await q;
  const items = (data ?? []).map((r) => {
    const cat = r.category as { name: string; color: string } | { name: string; color: string }[] | null;
    const category = Array.isArray(cat) ? (cat[0] ?? null) : cat;
    return {
      id: r.id as string,
      amount: r.amount as number,
      direction: r.direction as "debit" | "credit",
      occurredAt: r.occurred_at as string,
      description: r.description as string,
      isTransfer: r.is_transfer as boolean,
      category,
    };
  });
  return { items, failed: !!error };
}
