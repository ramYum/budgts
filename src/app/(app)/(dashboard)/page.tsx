import { redirect } from "next/navigation";
import { after } from "next/server";
import { buildDashboard, type DashboardCategory } from "@/lib/budget/dashboard";
import { currentMonthKey, monthKey, todayDateKey } from "@/lib/budget/month";
import { priorMonths, spendTrend } from "@/lib/budget/spend-trend";
import { goalsSummary, type SavingsContribution, type SavingsGoal } from "@/lib/budget/savings";
import type { BudgetTxn } from "@/lib/budget/types";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { selectableAccounts, type SelectableAccountRow } from "@/lib/accounts/selectable-accounts";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { isEventRole } from "@/lib/plaid/event-role";
import { nudgeRefresh } from "@/server/plaid/service";
import { DashboardView, type RecentActivityItem } from "@/components/dashboard-view";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import type { AccountOption } from "@/components/transaction-form";

const MONTH_RE = /^\d{4}-\d{2}$/;

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

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const month = typeof sp.m === "string" && MONTH_RE.test(sp.m) ? sp.m : currentMonthKey();
  const { start, end } = monthRange(month);

  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();

  // Nudge Plaid to check for new data now that the user is looking, without
  // holding up the response — see nudgeRefresh's docstring for the throttle.
  if (plaidUiEnabled()) after(() => nudgeRefresh(user.id));

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
  const txnPage = (gte: string, lt: string) => (from: number, to: number) => {
    let q = supabase
      .from("transactions")
      .select(txnCols)
      .gte("occurred_at", gte)
      .lt("occurred_at", lt)
      .order("id", { ascending: true })
      .range(from, to);
    // Soft-deleted bank rows (Plaid `removed`) must not count toward spend.
    // Guarded: the column only exists where migration 0004 has run.
    if (plaidUiEnabled()) q = q.is("removed_at", null);
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
  if (plaidUiEnabled()) recentQuery = recentQuery.is("removed_at", null);

  const [
    trendTxnRows,
    { data: categories },
    { data: budgetRows },
    { data: profile },
    { data: accountRows },
    { data: liveLinkedAccounts },
    { data: excludedPlaidAccounts },
    { data: recentRows },
    { data: goalRows },
    { data: contribRows },
  ] = await Promise.all([
    trendTxnRowsPromise,
    supabase
      .from("categories")
      .select("id, kind, name, color")
      .eq("is_archived", false),
    supabase.from("budgets").select("category_id, amount").eq("month", `${month}-01`),
    supabase.from("profiles").select("currency").eq("id", user.id).single(),
    supabase.from("accounts").select("id, name, source").eq("is_archived", false).order("name"),
    // Accounts currently linked to a live bank connection — disconnecting a
    // bank deletes its plaid_accounts row (cascade) without touching the
    // accounts row, so this set is what makes selectableAccounts() below
    // drop a disconnected bank's leftover account from the manual-entry
    // dropdown instead of showing it forever.
    plaidUiEnabled()
      ? supabase.from("plaid_accounts").select("account_id").not("account_id", "is", null)
      : Promise.resolve({ data: [] as { account_id: string | null }[] }),
    // Explicit owner-excluded connections (design: 2026-09-13 Advancial
    // containment) — a Plaid account the owner has confirmed is unreliable.
    // Self-gates like the rest of the Plaid UI: an empty result under a
    // pre-migration DB is indistinguishable from "no exclusions," which is
    // the correct, safe default either way.
    plaidUiEnabled()
      ? supabase.from("plaid_accounts").select("id").eq("excluded_from_calculations", true)
      : Promise.resolve({ data: [] as { id: string }[] }),
    recentQuery,
    supabase
      .from("savings_goals")
      .select("id, name, target_amount, target_date, is_archived")
      .eq("is_archived", false)
      .order("created_at"),
    supabase.from("savings_contributions").select("goal_id, amount"),
  ]);

  const excludedPlaidAccountIds = new Set((excludedPlaidAccounts ?? []).map((a) => a.id));

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
  const cats: DashboardCategory[] = (categories ?? []) as DashboardCategory[];
  const budgets = (budgetRows ?? []).map((b) => ({ categoryId: b.category_id, amount: b.amount }));
  const liveLinkedAccountIds = new Set(
    (liveLinkedAccounts ?? []).map((a) => a.account_id).filter((id): id is string => id != null),
  );
  const accounts: AccountOption[] = selectableAccounts(
    (accountRows ?? []) as SelectableAccountRow[],
    liveLinkedAccountIds,
  );
  const defaultDate = currentMonthKey() === month ? todayDateKey() : `${month}-15`;

  const view = buildDashboard(txns, cats, budgets, month);
  const prevView = buildDashboard(prevTxns, cats, [], prevMonth);
  const trend = spendTrend(trendTxns, cats, trendMonths);

  const goals: SavingsGoal[] = (goalRows ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    targetAmount: g.target_amount,
    targetDate: g.target_date,
    isArchived: g.is_archived,
  }));
  const contributions: SavingsContribution[] = (contribRows ?? []).map((c) => ({
    goalId: c.goal_id,
    amount: c.amount,
  }));
  const savings = goalsSummary(goals, contributions);

  const recent: RecentActivityItem[] = (recentRows ?? []).map((r) => {
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

  return (
    <div className="pb-2">
      {/* `transactions` is covered by the dashboard layout's RealtimeRefresh. */}
      <RealtimeRefresh tables={["budgets"]} />
      <DashboardView
        view={view}
        prevView={prevView}
        trend={trend}
        currency={profile?.currency ?? "USD"}
        month={month}
        accounts={accounts}
        categories={cats}
        defaultDate={defaultDate}
        savings={savings}
        recent={recent}
        userEmail={user.email ?? ""}
      />
    </div>
  );
}
