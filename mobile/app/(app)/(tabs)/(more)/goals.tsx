import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { authFetch } from "../../../../lib/auth/api";
import { useAuth } from "../../../../lib/auth/auth-context";
import { invalidate, useVersion } from "../../../../lib/api/invalidate";
import { loadResource, mutate } from "../../../../lib/api/load";
import { jsonInit } from "../../../../lib/api/request";
import { useResource } from "../../../../lib/api/use-resource";
import { useRealtimeRefresh } from "../../../../lib/realtime/use-realtime-refresh";
import { parseGoals, type MobileGoal } from "../../../../lib/goals/goals-api";
import { submittedOf } from "../../../../lib/goals/submit";
import { ContributionSheet, GoalFormSheet, goalInitial, type ContributionValues, type GoalValues } from "../../../../components/goals/goal-sheets";
import { GoalsView, type GoalAction } from "../../../../components/goals/goals-view";
import { LoadFailure } from "../../../../components/feedback/states";
import { ScreenSkeleton } from "../../../../components/feedback/skeleton";
import { Screen } from "../../../../components/shell/screen";

const WITHDRAW_HINT = "Use this to take money out or fix a mistake. It's recorded as a negative entry.";

type Sheet = null | { kind: "new" } | { kind: "edit" | "add" | "withdraw"; goal: MobileGoal };

/**
 * Savings goals (web /goals): each active goal's progress and the totals from `GET /api/mobile/goals` (the same
 * `loadGoals` the web page renders); new / edit goal, add money and withdraw in the web's sheets, archive from the row menu.
 */
export default function GoalsScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  // A save or a change on another device bumps the version and reloads in place, as the web revalidates the page.
  const version = useVersion("goals");
  useRealtimeRefresh(["savings_goals", "savings_contributions"]);
  const { state, reload, refresh, refreshing, notice } = useResource("goals", (s) => loadResource(() => authFetch("/api/mobile/goals", s), parseGoals), { version });
  const data = state.status === "ready" ? state.data : null;

  const [sheet, setSheet] = useState<Sheet>(null);
  const [archiving, setArchiving] = useState<string | null>(null);

  const saved = useCallback(() => invalidate("goals", "home"), []);

  const send = useCallback(
    async (path: string, method: "POST" | "PATCH", body: object, fallback: string) => {
      const out = submittedOf(await mutate(() => authFetch(path, session, jsonInit(method, body))), fallback);
      // saved, or saved by an earlier try (replayed): either way the goals behind show the kept row
      if (typeof out !== "string") saved();
      return out;
    },
    [session, saved],
  );

  const archive = useCallback(
    async (g: MobileGoal) => {
      setArchiving(g.id);
      const message = await send(`/api/mobile/goals/${g.id}`, "PATCH", { archived: true }, "Invalid goal");
      setArchiving(null);
      // The web drops this outcome; the app says so rather than leaving the goal up with no word.
      if (typeof message === "string") Alert.alert(`Couldn't archive ${g.name}`, message);
    },
    [send],
  );

  const onAction = (action: GoalAction, goal: MobileGoal) => {
    if (action === "archive") void archive(goal);
    else setSheet({ kind: action, goal });
  };

  const close = () => setSheet(null);

  return (
    // Pull to refresh keeps the figures up while it asks; a failed pull keeps them and says they may be out of date.
    <Screen refreshing={refreshing} onRefresh={() => void refresh()} name="goals" notice={notice} onRetry={() => void refresh()}>
      {data === null ? (
        state.status === "error" ? (
          <LoadFailure kind={state.kind} onRetry={() => void reload()} onHome={() => router.navigate("/")} onSignOut={() => void signOut()} />
        ) : (
          <ScreenSkeleton />
        )
      ) : (
        <GoalsView data={data} archiving={archiving} onBack={() => router.navigate("/more")} onNew={() => setSheet({ kind: "new" })} onAction={onAction} />
      )}

      {sheet?.kind === "new" ? (
        <GoalFormSheet
          title="New goal"
          submitLabel="Create goal"
          onClose={close}
          onSubmit={(v: GoalValues, requestId) => send("/api/mobile/goals", "POST", { ...v, requestId }, "Invalid goal")}
        />
      ) : null}
      {sheet?.kind === "edit" ? (
        <GoalFormSheet
          title="Edit goal"
          submitLabel="Save changes"
          initial={goalInitial(sheet.goal)}
          onClose={close}
          onSubmit={(v: GoalValues) => send(`/api/mobile/goals/${sheet.goal.id}`, "PATCH", v, "Invalid goal")}
        />
      ) : null}
      {(sheet?.kind === "add" || sheet?.kind === "withdraw") && data ? (
        <ContributionSheet
          key={`${sheet.kind}:${sheet.goal.id}`}
          title={sheet.kind === "add" ? `Add to ${sheet.goal.name}` : `Withdraw from ${sheet.goal.name}`}
          submitLabel={sheet.kind === "add" ? "Add contribution" : "Withdraw"}
          hint={sheet.kind === "withdraw" ? WITHDRAW_HINT : undefined}
          today={data.today}
          onClose={close}
          onSubmit={(v: ContributionValues, requestId) =>
            send(`/api/mobile/goals/${sheet.goal.id}/contributions`, "POST", { kind: sheet.kind, ...v, requestId }, "Invalid contribution")
          }
        />
      ) : null}
    </Screen>
  );
}
