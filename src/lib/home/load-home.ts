/**
 * Home's data: every read the Home screen needs for one month, and the authoritative money math over it
 * (`buildDashboard`, `spendTrend`, `goalsSummary`). One implementation, used by the web Home page
 * (`src/app/(app)/(dashboard)/page.tsx`) and the native `GET /api/mobile/home` route, so the two surfaces can never
 * disagree about a number. Moved verbatim out of the web page (2026-09-27, Stage 0 port); no formula lives here.
 *
 * Framework-free: no `next/*` import. The caller supplies the Supabase client (the web page's cookie client, or the
 * native caller's Bearer client — RLS scopes both to the user), the user's time zone (which decides "this month" and
 * "today"), and the month to show. Side effects such as the Plaid refresh nudge stay with the caller.
 *
 * `degraded` names every side query that failed. The web page renders as it always has; the native route refuses to
 * serve partial money numbers when it is non-empty.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDashboard, type DashboardCategory, type DashboardView } from "@/lib/budget/dashboard";
import { currentMonthKey, monthKey, todayDateKey } from "@/lib/budget/month";
import { priorMonths, spendTrend } from "@/lib/budget/spend-trend";
import { goalsSummary, type GoalsSummary, type SavingsContribution, type SavingsGoal } from "@/lib/budget/savings";
import type { BudgetTxn } from "@/lib/budget/types";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAllRows, type RowCount } from "@/lib/supabase/fetch-all-rows";
import { selectableAccounts, type SelectableAccountRow } from "@/lib/accounts/selectable-accounts";
import { isEventRole } from "@/lib/plaid/event-role";

export type HomeAccountOption = { id: string; name: string };

export type HomeRecentItem = {
  id: string;
  amount: number;
  direction: "debit" | "credit";
  occurredAt: string;
  description: string;
  isTransfer: boolean;
  category: { name: string; color: string } | null;
};

export type HomeData = {
  month: string;
  /** The user's current month in their own time zone. */
  thisMonth: string;
  view: DashboardView;
  prevView: DashboardView;
  trend: ReturnType<typeof spendTrend>;
  currency: string;
  accounts: HomeAccountOption[];
  categories: DashboardCategory[];
  defaultDate: string;
  savings: GoalsSummary;
  recent: HomeRecentItem[];
  /** null when Plaid is off; otherwise whether any bank connection exists. */
  bankConnected: boolean | null;
  /** The side queries that failed (empty when every read succeeded). */
  degraded: string[];
};

export type LoadHomeInput = {
  userId: string;
  timeZone: string;
  /** `YYYY-MM`; the user's current month when absent. */
  month?: string;
  plaidEnabled: boolean;
};

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

export async function loadHome(supabase: SupabaseClient, input: LoadHomeInput): Promise<HomeData> {
  const { userId, timeZone, plaidEnabled } = input;
  const thisMonth = currentMonthKey(timeZone);
  const month = input.month ?? thisMonth;
  const { start, end } = monthRange(month);

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
  const txnCols =
    "category_id, amount, direction, occurred_at, status, is_transfer, duplicate_of_id, event_role, transfer_user_set, plaid_account_id";
  // fetchAllRows, not a bare await: an unbounded `.select()` silently caps
  // at PostgREST's default 1000 rows, and a heavy Plaid feed (a real,
  // confirmed case) can exceed that within a single month — see
  // fetch-all-rows.ts. Ordered by `id` (unique) so pagination across pages
  // is deterministic; a timestamp column here has many exact ties from
  // bulk-inserted sync batches.
  const txnPage = (gte: string, lt: string) => (from: number, to: number, count: RowCount) => {
    let q = supabase
      .from("transactions")
      .select(txnCols, { count })
      .gte("occurred_at", gte)
      .lt("occurred_at", lt)
      .order("id", { ascending: true })
      .range(from, to);
    // Soft-deleted bank rows (Plaid `removed`) must not count toward spend.
    // Guarded: the column only exists where migration 0004 has run.
    if (plaidEnabled) q = q.is("removed_at", null);
    return q.returns<TxnRow[]>();
  };

  const prevMonth = prevMonthKey(month);
  const { start: prevStart, end: prevEnd } = monthRange(prevMonth);

  // Home's "Total spending" trend card (design: Budgts Reference V2 Insights
  // screen) — one bounded query covering the last 6 months, then the same
  // pure `rollup` Home/Budgets/Insights already use, called once per month.
  const trendMonths = priorMonths(month, 6);
  const { start: trendStart } = monthRange(trendMonths[0]!);

  // One paginated fetch covers the trend window; this month and last month are
  // slices of it (the window ends at this month's end and spans 6 months), so
  // they are filtered in memory rather than re-fetched.
  const trendTxnRowsPromise = fetchAllRows(txnPage(trendStart, end));

  let recentQuery = supabase
    .from("transactions")
    .select(
      "id, amount, direction, occurred_at, description, is_transfer, category:categories(name,color)",
    )
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);
  if (plaidEnabled) recentQuery = recentQuery.is("removed_at", null);

  const [
    trendTxnRows,
    categoriesRes,
    budgetsRes,
    profileRes,
    accountsRes,
    liveLinkedRes,
    excludedRes,
    recentRes,
    goalsRes,
    contribRes,
    bankCountRes,
  ] = await Promise.all([
    trendTxnRowsPromise,
    supabase
      .from("categories")
      .select("id, kind, name, color")
      .eq("is_archived", false),
    supabase.from("budgets").select("category_id, amount").eq("month", `${month}-01`),
    supabase.from("profiles").select("currency").eq("id", userId).single(),
    supabase.from("accounts").select("id, name, source").eq("is_archived", false).order("name"),
    // Accounts currently linked to a live bank connection — disconnecting a
    // bank deletes its plaid_accounts row (cascade) without touching the
    // accounts row, so this set is what makes selectableAccounts() below
    // drop a disconnected bank's leftover account from the manual-entry
    // dropdown instead of showing it forever.
    plaidEnabled
      ? supabase.from("plaid_accounts").select("account_id").not("account_id", "is", null)
      : Promise.resolve({ data: [] as { account_id: string | null }[], error: null }),
    // Explicit owner-excluded connections (design: 2026-09-13 Advancial
    // containment) — a Plaid account the owner has confirmed is unreliable.
    // Self-gates like the rest of the Plaid UI: an empty result under a
    // pre-migration DB is indistinguishable from "no exclusions," which is
    // the correct, safe default either way.
    plaidEnabled
      ? supabase.from("plaid_accounts").select("id").eq("excluded_from_calculations", true)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
    recentQuery,
    supabase
      .from("savings_goals")
      .select("id, name, target_amount, target_date, is_archived")
      .eq("is_archived", false)
      .order("created_at"),
    supabase.from("savings_contributions").select("goal_id, amount"),
    // "Get set up" marks the bank step done once any connection exists.
    plaidEnabled
      ? supabase.from("plaid_items").select("id", { count: "exact", head: true })
      : Promise.resolve({ count: null, error: null }),
  ]);

  const degraded = Object.entries({
    categories: categoriesRes.error,
    budgets: budgetsRes.error,
    profile: profileRes.error,
    accounts: accountsRes.error,
    linkedAccounts: liveLinkedRes.error,
    excludedAccounts: excludedRes.error,
    recent: recentRes.error,
    goals: goalsRes.error,
    contributions: contribRes.error,
    bankCount: bankCountRes.error,
  })
    .filter(([, error]) => error != null)
    .map(([name]) => name);

  const excludedPlaidAccountIds = new Set((excludedRes.data ?? []).map((a) => a.id));

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

  const trendTxns: BudgetTxn[] = (trendTxnRows ?? []).map(toBudgetTxn);
  const inRange = (t: BudgetTxn, from: string, to: string) =>
    t.occurredAt.getTime() >= Date.parse(from) && t.occurredAt.getTime() < Date.parse(to);
  const txns = trendTxns.filter((t) => inRange(t, start, end));
  const prevTxns = trendTxns.filter((t) => inRange(t, prevStart, prevEnd));
  const cats: DashboardCategory[] = (categoriesRes.data ?? []) as DashboardCategory[];
  const budgets = (budgetsRes.data ?? []).map((b) => ({ categoryId: b.category_id, amount: b.amount }));
  const liveLinkedAccountIds = new Set(
    (liveLinkedRes.data ?? []).map((a) => a.account_id).filter((id): id is string => id != null),
  );
  const accounts: HomeAccountOption[] = selectableAccounts(
    (accountsRes.data ?? []) as SelectableAccountRow[],
    liveLinkedAccountIds,
  );
  const defaultDate = thisMonth === month ? todayDateKey(timeZone) : `${month}-15`;

  const view = buildDashboard(txns, cats, budgets, month);
  const prevView = buildDashboard(prevTxns, cats, [], prevMonth);
  const trend = spendTrend(trendTxns, cats, trendMonths);

  const goals: SavingsGoal[] = (goalsRes.data ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    targetAmount: g.target_amount,
    targetDate: g.target_date,
    isArchived: g.is_archived,
  }));
  const contributions: SavingsContribution[] = (contribRes.data ?? []).map((c) => ({
    goalId: c.goal_id,
    amount: c.amount,
  }));
  const savings = goalsSummary(goals, contributions);

  const recent: HomeRecentItem[] = (recentRes.data ?? []).map((r) => {
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

  return {
    month,
    thisMonth,
    view,
    prevView,
    trend,
    currency: profileRes.data?.currency ?? "USD",
    accounts,
    categories: cats,
    defaultDate,
    savings,
    recent,
    bankConnected: plaidEnabled ? (bankCountRes.count ?? 0) > 0 : null,
    degraded,
  };
}
