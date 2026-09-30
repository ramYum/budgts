import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { authFetch } from "../../../../lib/auth/api";
import { useAuth } from "../../../../lib/auth/auth-context";
import { invalidate, useVersion } from "../../../../lib/api/invalidate";
import { loadResource, mutate } from "../../../../lib/api/load";
import { jsonInit } from "../../../../lib/api/request";
import { useResource } from "../../../../lib/api/use-resource";
import { useRealtimeRefresh } from "../../../../lib/realtime/use-realtime-refresh";
import { parseBudgets } from "../../../../lib/budgets/budgets-api";
import { budgetsLink, readBudgetsParams } from "../../../../lib/budgets/params";
import { useUserDates } from "../../../../lib/profile/profile-context";
import { CategorySheet, NewBudgetSheet, type SaveBudget } from "../../../../components/budgets/budget-sheets";
import { BudgetsView, type BudgetsRange } from "../../../../components/budgets/budgets-view";
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
  const initial = readBudgetsParams(raw, thisMonth);
  const [month, setMonth] = useState(initial.month);
  const [range, setRange] = useState<BudgetsRange>(initial.range);
  const [detail, setDetail] = useState<{ id: string; editing: boolean } | null>(initial.edit ? { id: initial.edit, editing: true } : null);
  const [adding, setAdding] = useState(false);

  // A later link into the tab (Home's "Set budget") applies its params as a web navigation to /budgets?… would.
  const linked = `${raw.m ?? ""}|${raw.range ?? ""}|${raw.edit ?? ""}`;
  const firstLink = useRef(linked);
  useEffect(() => {
    if (linked === firstLink.current) return;
    firstLink.current = linked;
    const next = readBudgetsParams(raw, thisMonth);
    setMonth(next.month);
    setRange(next.range);
    setDetail(next.edit ? { id: next.edit, editing: true } : null);
  }, [linked]);

  const version = useVersion("budgets");
  useRealtimeRefresh(["budgets"]);
  const { state, reload } = useResource(
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

  // Pull to refresh reloads (the figures stay up meanwhile); a failure shows the failure page, never the old figures
  // as if they were current.
  const [pulling, setPulling] = useState(false);
  const pull = async () => {
    setPulling(true);
    await reload();
    setPulling(false);
  };

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
    <Screen
      refreshing={pulling}
      onRefresh={() => void pull()}
    >
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
            setMonth(m);
            setRange("month");
            setCopyError(null);
          }}
          onRange={setRange}
          onOpen={(id, editing) => setDetail({ id, editing })}
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
            setDetail(null);
            router.navigate(budgetsLink.activity(month, bar.id));
          }}
          onClose={() => setDetail(null)}
        />
      ) : null}
      {adding && monthData ? (
        <NewBudgetSheet categories={monthData.unbudgetedCategories} onSave={saveBudget} onClose={() => setAdding(false)} />
      ) : null}
    </Screen>
  );
}
