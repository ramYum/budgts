import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../../../lib/auth/auth-context";
import { authFetch } from "../../../../lib/auth/api";
import { loadResource } from "../../../../lib/api/load";
import { useResource } from "../../../../lib/api/use-resource";
import { budgetsLink } from "../../../../lib/budgets/params";
import { parseInsights, type MobileInsights } from "../../../../lib/insights/insights-api";
import { useUserDates } from "../../../../lib/profile/profile-context";
import { InsightsView } from "../../../../components/insights/insights-view";
import { LoadFailure } from "../../../../components/feedback/states";
import { ScreenSkeleton } from "../../../../components/feedback/skeleton";
import { Screen } from "../../../../components/shell/screen";

const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * Insights (web /insights?m=): the month's Money left, savings rate, "Where you could save", the breakdown and the trend,
 * from `GET /api/mobile/insights` (the same `loadInsights` the web page renders). Reached from More; back goes to /more
 * as the web's does. The suggestion links as the web's: unplanned spending opens that budget, a mover its transactions.
 */
export default function InsightsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { month: thisMonth } = useUserDates();
  const { m } = useLocalSearchParams<{ m?: string }>();
  const [month, setMonth] = useState(typeof m === "string" && MONTH_RE.test(m) ? m : thisMonth);

  const { state, reload } = useResource(`insights|${month}`, (s) =>
    loadResource(() => authFetch(`/api/mobile/insights?month=${month}`, s), parseInsights),
  );

  // Only the month on screen; while a pull reloads it, the last of it stays up.
  const last = useRef<MobileInsights | null>(null);
  if (state.status === "ready") last.current = state.data;
  const shown = state.status === "ready" ? state.data : state.status === "loading" ? last.current : null;
  const data = shown && shown.month === month ? shown : null;

  const [pulling, setPulling] = useState(false);
  useEffect(() => {
    if (state.status !== "loading") setPulling(false);
  }, [state.status]);

  return (
    <Screen
      refreshing={pulling}
      onRefresh={() => {
        setPulling(true);
        void reload();
      }}
    >
      {data === null ? (
        state.status === "error" ? (
          <LoadFailure kind={state.kind} onRetry={() => void reload()} onHome={() => router.navigate("/")} onSignOut={() => void signOut()} />
        ) : (
          <ScreenSkeleton />
        )
      ) : (
        <InsightsView
          data={data}
          onBack={() => router.navigate("/more")}
          onMonth={setMonth}
          onSuggestion={(s) =>
            router.navigate(s.kind === "unbudgeted" ? budgetsLink.edit(month, s.categoryId) : budgetsLink.activity(month, s.categoryId))
          }
        />
      )}
    </Screen>
  );
}
