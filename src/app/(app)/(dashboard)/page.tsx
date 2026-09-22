import { redirect } from "next/navigation";
import { after } from "next/server";
import { monthKey } from "@/lib/budget/month";
import { loadMonthlyDashboard, loadRecentActivity } from "@/lib/budget/home-data";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { selectableAccounts, type SelectableAccountRow } from "@/lib/accounts/selectable-accounts";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { nudgeRefresh } from "@/server/plaid/service";
import { DashboardView } from "@/components/dashboard-view";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import type { AccountOption } from "@/components/transaction-form";

const MONTH_RE = /^\d{4}-\d{2}$/;

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const month = typeof sp.m === "string" && MONTH_RE.test(sp.m) ? sp.m : monthKey(new Date());

  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();

  // Nudge Plaid to check for new data now that the user is looking, without
  // holding up the response — see nudgeRefresh's docstring for the throttle.
  if (plaidUiEnabled()) after(() => nudgeRefresh(user.id));

  // The dashboard numbers (and the queries/filters behind them) live in
  // `loadMonthlyDashboard`, shared with `GET /api/mobile/home` so web and
  // mobile can never disagree about Money Left.
  const [dash, recent, { data: accountRows }, { data: liveLinkedAccounts }] = await Promise.all([
    loadMonthlyDashboard(supabase, user.id, month, plaidUiEnabled()),
    loadRecentActivity(supabase, plaidUiEnabled()),
    supabase.from("accounts").select("id, name, source").eq("is_archived", false).order("name"),
    // Accounts currently linked to a live bank connection — disconnecting a
    // bank deletes its plaid_accounts row (cascade) without touching the
    // accounts row, so this set is what makes selectableAccounts() below
    // drop a disconnected bank's leftover account from the manual-entry
    // dropdown instead of showing it forever.
    plaidUiEnabled()
      ? supabase.from("plaid_accounts").select("account_id").not("account_id", "is", null)
      : Promise.resolve({ data: [] as { account_id: string | null }[] }),
  ]);

  const liveLinkedAccountIds = new Set(
    (liveLinkedAccounts ?? []).map((a) => a.account_id).filter((id): id is string => id != null),
  );
  const accounts: AccountOption[] = selectableAccounts(
    (accountRows ?? []) as SelectableAccountRow[],
    liveLinkedAccountIds,
  );
  const defaultDate = (monthKey(new Date()) === month ? new Date().toISOString() : `${month}-15T12:00:00Z`).slice(
    0,
    10,
  );

  return (
    <div className="pb-2">
      {/* `transactions` is covered by the dashboard layout's RealtimeRefresh. */}
      <RealtimeRefresh tables={["budgets"]} />
      <DashboardView
        view={dash.view}
        prevView={dash.prevView}
        trend={dash.trend}
        currency={dash.currency}
        month={month}
        accounts={accounts}
        categories={dash.categories}
        defaultDate={defaultDate}
        savings={dash.savings}
        recent={recent.items}
        userEmail={user.email ?? ""}
      />
    </div>
  );
}
