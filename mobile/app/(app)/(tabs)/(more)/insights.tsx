import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../../../lib/auth/auth-context";
import { authFetch } from "../../../../lib/auth/api";
import { loadResource } from "../../../../lib/api/load";
import { useVersion } from "../../../../lib/api/invalidate";
import { useResource } from "../../../../lib/api/use-resource";
import { budgetsLink } from "../../../../lib/budgets/params";
import { parseInsights } from "../../../../lib/insights/insights-api";
import { useUserDates } from "../../../../lib/profile/profile-hooks";
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

  // A new month is a new page (the skeleton); a save or a synced transaction refreshes this one in place, as the web
  // layout's realtime refresh re-renders the page on screen.
  const txVersion = useVersion("transactions");
  const budgetsVersion = useVersion("budgets");
  const { state, reload, refresh, refreshing, notice } = useResource(
    `insights|${month}`,
    (s) => loadResource(() => authFetch(`/api/mobile/insights?month=${month}`, s), parseInsights),
    { version: `${txVersion}:${budgetsVersion}` },
  );

  // Only the month on screen.
  const shown = state.status === "ready" ? state.data : null;
  const data = shown && shown.month === month ? shown : null;

  return (
    // Pull to refresh keeps the figures up while it asks; a failed pull keeps them and says they may be out of date.
    <Screen refreshing={refreshing} onRefresh={() => void refresh()} name="insights" notice={notice} onRetry={() => void refresh()}>
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
