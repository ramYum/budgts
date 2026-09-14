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
import { PageHeader } from "@/components/page-header";
import { InsightsView } from "@/components/insights-view";

export const metadata: Metadata = { title: "Insights" };

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
 * Insights can never disagree with Home for the same month. */
async function loadMonth(
  supabase: Awaited<ReturnType<typeof createClient>>,
  month: string,
  excludedPlaidAccountIds: Set<string>,
): Promise<BudgetTxn[]> {
  const { start, end } = monthRange(month);
  const plaidOn = plaidUiEnabled();
  // fetchAllRows, not a bare await — see fetch-all-rows.ts: an unbounded
  // `.select()` silently caps at 1000 rows, which a heavy Plaid feed can
  // exceed within a single month.
  const data = await fetchAllRows((from, to) => {
    let q = supabase
      .from("transactions")
      .select(
        "category_id, amount, direction, occurred_at, status, is_transfer, duplicate_of_id, event_role, transfer_user_set, plaid_account_id",
      )
      .gte("occurred_at", start)
      .lt("occurred_at", end)
      .order("id", { ascending: true })
      .range(from, to);
    if (plaidOn) q = q.is("removed_at", null);
    return q.returns<TxnRow[]>();
  });
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

/** "What can I change to save more?" (design spec §24-26). Composes the same
 * pure `buildDashboard`/`monthlyActuals` functions Home and Budgets already
 * use, called once for the current month and once for the previous one —
 * pure presentation-layer composition, no new financial semantics. Net worth
 * is intentionally omitted: it isn't implemented, and the spec is explicit
 * that Money Left must never stand in for it. */
export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  const sp = await searchParams;
  const month = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : monthKey(new Date());
  const prev = prevMonthKey(month);

  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();

  const [{ data: categories }, { data: budgetRows }, { data: profile }, { data: excludedPlaidAccounts }] =
    await Promise.all([
      supabase.from("categories").select("id, kind, name, color").eq("is_archived", false),
      supabase.from("budgets").select("category_id, amount").eq("month", `${month}-01`),
      supabase.from("profiles").select("currency").eq("id", user.id).single(),
      plaidUiEnabled()
        ? supabase.from("plaid_accounts").select("id").eq("excluded_from_calculations", true)
        : Promise.resolve({ data: [] as { id: string }[] }),
    ]);

  const excludedPlaidAccountIds = new Set((excludedPlaidAccounts ?? []).map((a) => a.id));
  const [currentTxns, prevTxns] = await Promise.all([
    loadMonth(supabase, month, excludedPlaidAccountIds),
    loadMonth(supabase, prev, excludedPlaidAccountIds),
  ]);

  const cats: DashboardCategory[] = (categories ?? []) as DashboardCategory[];
  const budgets = (budgetRows ?? []).map((b) => ({ categoryId: b.category_id, amount: b.amount }));

  const current = buildDashboard(currentTxns, cats, budgets, month);
  const previous = buildDashboard(prevTxns, cats, [], prev);

  const incomeCategories = cats.filter((c) => c.kind === "income");
  const currentIncomeByCategory = monthlyActuals(currentTxns, month);
  const incomeSources = incomeCategories
    .map((c) => ({ name: c.name, color: c.color, amount: Math.max(0, -(currentIncomeByCategory.get(c.id) ?? 0)) }))
    .filter((s) => s.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="pt-1">
      <PageHeader title="Insights" back="/more" />
      <InsightsView
        month={month}
        currency={profile?.currency ?? "USD"}
        current={current}
        previous={previous}
        incomeSources={incomeSources}
      />
    </div>
  );
}
