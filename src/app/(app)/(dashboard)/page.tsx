import { redirect } from "next/navigation";
import { after } from "next/server";
import { buildDashboard, type DashboardCategory } from "@/lib/budget/dashboard";
import { monthKey } from "@/lib/budget/month";
import type { BudgetTxn } from "@/lib/budget/types";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { isEventRole } from "@/lib/plaid/event-role";
import { nudgeRefresh } from "@/server/plaid/service";
import { DashboardView } from "@/components/dashboard-view";
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

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const month = typeof sp.m === "string" && MONTH_RE.test(sp.m) ? sp.m : monthKey(new Date());
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
  >;
  let txnQuery = supabase
    .from("transactions")
    .select(
      "category_id, amount, direction, occurred_at, status, is_transfer, duplicate_of_id, event_role, transfer_user_set",
    )
    .gte("occurred_at", start)
    .lt("occurred_at", end);
  // Soft-deleted bank rows (Plaid `removed`) must not count toward spend.
  // Guarded: the column only exists where migration 0004 has run.
  if (plaidUiEnabled()) txnQuery = txnQuery.is("removed_at", null);

  const [{ data: txnRows }, { data: categories }, { data: budgetRows }, { data: profile }, { data: accountRows }] =
    await Promise.all([
      txnQuery.returns<TxnRow[]>(),
      supabase
        .from("categories")
        .select("id, kind, name, color")
        .eq("is_archived", false),
      supabase.from("budgets").select("category_id, amount").eq("month", `${month}-01`),
      supabase.from("profiles").select("currency").eq("id", user.id).single(),
      supabase.from("accounts").select("id, name").eq("is_archived", false).order("name"),
    ]);

  const txns: BudgetTxn[] = (txnRows ?? []).map((t) => ({
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
  }));
  const cats: DashboardCategory[] = (categories ?? []) as DashboardCategory[];
  const budgets = (budgetRows ?? []).map((b) => ({ categoryId: b.category_id, amount: b.amount }));
  const accounts = (accountRows ?? []) as AccountOption[];
  const defaultDate = (monthKey(new Date()) === month ? new Date().toISOString() : `${month}-15T12:00:00Z`).slice(
    0,
    10,
  );

  const view = buildDashboard(txns, cats, budgets, month);

  return (
    <div className="pb-2">
      {/* `transactions` is covered by the dashboard layout's RealtimeRefresh. */}
      <RealtimeRefresh tables={["budgets"]} />
      <DashboardView
        view={view}
        currency={profile?.currency ?? "USD"}
        month={month}
        accounts={accounts}
        categories={cats}
        defaultDate={defaultDate}
      />
    </div>
  );
}
