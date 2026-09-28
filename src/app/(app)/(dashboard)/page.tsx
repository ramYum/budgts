import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { requireTimeZone } from "@/lib/current-profile";
import { loadHome } from "@/lib/home/load-home";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { nudgeRefresh } from "@/server/plaid/service";
import { DashboardView } from "@/components/dashboard-view";
import { RealtimeRefresh } from "@/components/realtime-refresh";

const MONTH_RE = /^\d{4}-\d{2}$/;

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const timeZone = await requireTimeZone(user.id);
  const month = typeof sp.m === "string" && MONTH_RE.test(sp.m) ? sp.m : undefined;
  const supabase = await createClient();

  // Nudge Plaid to check for new data now that the user is looking, without
  // holding up the response — see nudgeRefresh's docstring for the throttle.
  if (plaidUiEnabled()) after(() => nudgeRefresh(user.id));

  // Every read and all the money math live in loadHome, shared with the
  // native app's GET /api/mobile/home so the two can never disagree.
  const home = await loadHome(supabase, { userId: user.id, timeZone, month, plaidEnabled: plaidUiEnabled() });

  return (
    <div className="pb-2">
      {/* `transactions` is covered by the dashboard layout's RealtimeRefresh. */}
      <RealtimeRefresh tables={["budgets"]} />
      <DashboardView
        view={home.view}
        prevView={home.prevView}
        trend={home.trend}
        currency={home.currency}
        month={home.month}
        accounts={home.accounts}
        categories={home.categories}
        defaultDate={home.defaultDate}
        savings={home.savings}
        recent={home.recent}
        userEmail={user.email ?? ""}
        setup={{ bankConnected: home.bankConnected }}
      />
    </div>
  );
}
