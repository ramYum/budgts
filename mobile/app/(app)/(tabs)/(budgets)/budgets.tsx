import { useCallback, useState } from "react";
import { authFetch } from "../../../../lib/auth/api";
import { useAuth } from "../../../../lib/auth/auth-context";
import { invalidate, useVersion } from "../../../../lib/api/invalidate";
import { loadResource, mutate } from "../../../../lib/api/load";
import { jsonInit } from "../../../../lib/api/request";
import { useResource } from "../../../../lib/api/use-resource";
import { parseBudgets } from "../../../../lib/budgets/budgets-api";
import { useUserDates } from "../../../../lib/profile/profile-context";
import { Button } from "../../../../components/brand/controls";
import { BudgetsView, type BudgetsRange } from "../../../../components/budgets/budgets-view";
import { EmptyState } from "../../../../components/kit/empty-state";
import { Screen } from "../../../../components/shell/screen";

/** The web's copy-budgets message (src/server/budgets.ts `copyBudgetsFromPreviousMonth`). */
const NOTHING_TO_COPY = "There were no budgets last month to copy.";

/**
 * Budgets (web /budgets): budget vs actual per expense category for a month, or every category's all-time spending, from
 * `GET /api/mobile/budgets` (the same `loadBudgets` the web page renders). Stepping the month returns to This month, as the
 * web's month links do.
 */
export default function BudgetsScreen() {
  const { session } = useAuth();
  const { month: thisMonth } = useUserDates();
  const [month, setMonth] = useState(thisMonth);
  const [range, setRange] = useState<BudgetsRange>("month");
  const version = useVersion("budgets");

  const { state, reload, refresh, refreshing } = useResource(`${month}|${range}|${version}`, (s) =>
    loadResource(() => authFetch(`/api/mobile/budgets?month=${month}&range=${range}`, s), parseBudgets),
  );

  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyLastMonth = useCallback(async () => {
    setCopying(true);
    setCopyError(null);
    const out = await mutate(() => authFetch("/api/mobile/budgets/copy", session, jsonInit("POST", { month })));
    setCopying(false);
    if (out.status === "ok") return invalidate("budgets", "home");
    setCopyError(out.status === "nothing_to_copy" ? NOTHING_TO_COPY : out.status === "error" ? out.message : "Something went wrong. Please try again.");
  }, [month, session]);

  // Only the data for the range and month on screen: a late response for the other range never renders under this switch.
  const data = state.status === "ready" && state.data.range === range && state.data.month === month ? state.data : null;

  return (
    <Screen refreshing={refreshing} onRefresh={() => void refresh()}>
      <BudgetsView
        month={month}
        range={range}
        data={data}
        body={
          state.status === "error" ? (
            <EmptyState
              icon="warning"
              title="Can't show your budgets"
              body={state.message}
              action={
                <Button icon="sync" onPress={() => void reload()}>
                  Try again
                </Button>
              }
            />
          ) : null
        }
        onMonth={(m) => {
          setMonth(m);
          setRange("month");
          setCopyError(null);
        }}
        onRange={setRange}
        // The category sheet and the New budget sheet arrive with the Foundation's Overlay (F6), next in D4.
        onOpen={() => {}}
        onNew={() => {}}
        copy={{ pending: copying, error: copyError, onCopy: () => void copyLastMonth() }}
      />
    </Screen>
  );
}
