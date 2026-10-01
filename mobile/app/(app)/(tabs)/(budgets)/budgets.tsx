import { useCallback, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { authFetch } from "../../../../lib/auth/api";
import { useAuth } from "../../../../lib/auth/auth-context";
import { invalidate, useVersion } from "../../../../lib/api/invalidate";
import { loadResource, mutate } from "../../../../lib/api/load";
import { jsonInit } from "../../../../lib/api/request";
import { useResource } from "../../../../lib/api/use-resource";
import { useRealtimeRefresh } from "../../../../lib/realtime/use-realtime-refresh";
import { parseBudgets } from "../../../../lib/budgets/budgets-api";
import { budgetsLink } from "../../../../lib/budgets/params";
import { useBudgetsRoute } from "../../../../lib/budgets/use-budgets-route";
import { useUserDates } from "../../../../lib/profile/profile-context";
import { CategorySheet, NewBudgetSheet, type SaveBudget } from "../../../../components/budgets/budget-sheets";
import { BudgetsView } from "../../../../components/budgets/budgets-view";
import { LoadFailure } from "../../../../components/feedback/states";
import { ScreenSkeleton } from "../../../../components/feedback/skeleton";
import { Screen } from "../../../../components/shell/screen";

/** The web's budget messages (src/server/budgets.ts). */
const NOTHING_TO_COPY = "There were no budgets last month to copy.";
const MISSING_CATEGORY = "That category no longer exists. Refresh and try again.";

/**
 * Budgets (web /budgets): budget vs actual per expense category for a month, or every category's all-time spending, from
 * `GET /api/mobile/budgets` (the same `loadBudgets` the web page renders). It takes the web page's params (`m`, `range`,
 * `edit`; lib/budgets/params.ts). Stepping the month returns to This month, as the web's month links do.
 */
export default function BudgetsScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { month: thisMonth } = useUserDates();
  const raw = useLocalSearchParams<{ m?: string; range?: string; edit?: string }>();
  // month, range and the open sheet, in step with the route params (lib/budgets/use-budgets-route.ts)
  const { month, range, detail, showMonth, showRange, openDetail, closeDetail } = useBudgetsRoute(raw, thisMonth, (p) => router.setParams(p));
  const [adding, setAdding] = useState(false);

  const version = useVersion("budgets");
  useRealtimeRefresh(["budgets"]);
  const { state, reload, refresh, refreshing, notice } = useResource(
    `${month}|${range}`,
    (s) => loadResource(() => authFetch(`/api/mobile/budgets?month=${month}&range=${range}`, s), parseBudgets),
    { version },
  );

  // Only the data for the month and range on screen. A save or a realtime change reloads in place (useResource), so an
  // open sheet keeps its figures and updates, as the web revalidates under it. With none, the web's loading page (the
  // skeleton) or its failure page stands in for the whole page.
  const shown = state.status === "ready" ? state.data : null;
  const data = shown && shown.range === range && shown.month === month ? shown : null;
  const monthData = data?.range === "month" ? data : null;


  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyLastMonth = useCallback(async () => {
    setCopying(true);
    setCopyError(null);
    const out = await mutate(() => authFetch("/api/mobile/budgets/copy", session, jsonInit("POST", { month })));
    setCopying(false);
    if (out.status === "ok") return invalidate("budgets", "home");
    setCopyError(
      out.status === "nothing_to_copy" ? NOTHING_TO_COPY : out.status === "error" ? out.message : "Something went wrong. Please try again.",
    );
  }, [month, session]);

  const saveBudget = useCallback<SaveBudget>(
    async (categoryId, amount) => {
      const out = await mutate(() => authFetch("/api/mobile/budgets", session, jsonInit("PUT", { categoryId, month, amount })));
      if (out.status === "ok") {
        invalidate("budgets", "home");
        return null;
      }
      if (out.status === "invalid") return Object.values(out.fieldErrors)[0] ?? "Invalid budget";
      if (out.status === "missing") return MISSING_CATEGORY;
      return out.status === "error" ? out.message : "Something went wrong. Please try again.";
    },
    [month, session],
  );

  const bar = detail && monthData ? monthData.categories.find((c) => c.id === detail.id) : undefined;

  return (
    // Pull to refresh keeps the figures up while it asks; a failed pull keeps them and says they may be out of date.
    <Screen refreshing={refreshing} onRefresh={() => void refresh()} name="budgets" notice={notice} onRetry={() => void refresh()}>
      {data === null ? (
        state.status === "error" ? (
          <LoadFailure kind={state.kind} onRetry={() => void reload()} onHome={() => router.navigate("/")} onSignOut={() => void signOut()} />
        ) : (
          <ScreenSkeleton />
        )
      ) : (
        <BudgetsView
          month={month}
          range={range}
          data={data}
          onMonth={(m) => {
            setCopyError(null);
            showMonth(m);
          }}
          onRange={(r) => {
            setCopyError(null);
            showRange(r);
          }}
          onOpen={openDetail}
          onNew={() => setAdding(true)}
          copy={{ pending: copying, error: copyError, onCopy: () => void copyLastMonth() }}
        />
      )}
      {bar && monthData && detail ? (
        <CategorySheet
          key={`${detail.id}:${detail.editing}`}
          bar={bar}
          currency={monthData.currency}
          startEditing={detail.editing}
          onSave={saveBudget}
          onSeeTransactions={() => {
            closeDetail();
            router.navigate(budgetsLink.activity(month, bar.id));
          }}
          onClose={closeDetail}
        />
      ) : null}
      {adding && monthData ? (
        <NewBudgetSheet categories={monthData.unbudgetedCategories} onSave={saveBudget} onClose={() => setAdding(false)} />
      ) : null}
    </Screen>
  );
}
