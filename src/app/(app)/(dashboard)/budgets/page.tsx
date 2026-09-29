import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentMonthKey } from "@/lib/budget/month";
import { loadBudgets } from "@/lib/budgets/load-budgets";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { requireTimeZone } from "@/lib/current-profile";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { BudgetsView } from "@/components/budgets-view";

export const metadata: Metadata = { title: "Budgets" };

const MONTH_RE = /^\d{4}-\d{2}$/;

export default async function BudgetsPage({ searchParams }: PageProps<"/budgets">) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const timeZone = await requireTimeZone(user.id);
  const month = typeof sp.m === "string" && MONTH_RE.test(sp.m) ? sp.m : currentMonthKey(timeZone);
  const range = sp.range === "all" ? "all" : "month";
  // Home's "Set budget" links here with the category to open (a uuid).
  const edit = typeof sp.edit === "string" && /^[0-9a-f-]{36}$/i.test(sp.edit) ? sp.edit : null;

  // Every read and all the money math live in loadBudgets, shared with the
  // native app's GET /api/mobile/budgets so the two can never disagree.
  const data = await loadBudgets(await createClient(), {
    userId: user.id,
    timeZone,
    month,
    range,
    plaidEnabled: plaidUiEnabled(),
  });

  if (data.range === "all") {
    return (
      <BudgetsView
        range="all"
        month={data.month}
        currency={data.currency}
        allTimeRows={data.allTimeRows}
        categories={data.categories}
      />
    );
  }

  return (
    <>
      <RealtimeRefresh tables={["budgets"]} />
      <BudgetsView
        range="month"
        month={data.month}
        currency={data.currency}
        view={data.view}
        prevView={data.prevView}
        categories={data.categories}
        unbudgetedCategories={data.unbudgeted}
        initialEdit={edit}
      />
    </>
  );
}
