import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentMonthKey } from "@/lib/budget/month";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { requireTimeZone } from "@/lib/current-profile";
import { loadInsights } from "@/lib/insights/load-insights";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { PageHeader } from "@/components/page-header";
import { MonthNav } from "@/components/month-nav";
import { InsightsView } from "@/components/insights-view";

export const metadata: Metadata = { title: "Insights" };

/** "What can I change to save more?" (design spec §24-26). Composes the same
 * pure `buildDashboard`/`monthlyActuals` functions Home and Budgets already
 * use, called once for the current month and once for the previous one —
 * pure presentation-layer composition, no new financial semantics. Net worth
 * is intentionally omitted: it isn't implemented, and the spec is explicit
 * that Money Left must never stand in for it. */
export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const timeZone = await requireTimeZone(user.id);
  const month = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : currentMonthKey(timeZone);

  // Every read and all the money math live in loadInsights, shared with the
  // native app's GET /api/mobile/insights so the two can never disagree.
  const { currency, current, previous, trend, incomeSources } = await loadInsights(await createClient(), {
    userId: user.id,
    timeZone,
    month,
    plaidEnabled: plaidUiEnabled(),
  });

  return (
    <>
      <PageHeader
        title="Insights"
        back="/more"
        backOnDesktop={false}
        month={<MonthNav base="/insights" month={month} />}
      />
      <InsightsView
        month={month}
        currency={currency}
        current={current}
        previous={previous}
        trend={trend}
        incomeSources={incomeSources}
      />
    </>
  );
}
