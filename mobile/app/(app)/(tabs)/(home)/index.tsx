import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useIsFocused, useRouter, type Href } from "expo-router";
import { LoadFailure } from "../../../../components/feedback/states";
import { ScreenSkeleton } from "../../../../components/feedback/skeleton";
import { HomeView } from "../../../../components/home/home-view";
import { Screen } from "../../../../components/shell/screen";
import { authFetch } from "../../../../lib/auth/api";
import { useAuth } from "../../../../lib/auth/auth-context";
import { loadResource } from "../../../../lib/api/load";
import { useResource } from "../../../../lib/api/use-resource";
import { parseCategories } from "../../../../lib/categories/categories-api";
import { useHome } from "../../../../lib/home/use-home";
import { displayName } from "../../../../lib/home/view";
import { emptyDraft } from "../../../../lib/transactions/form";
import { useRealtimeRefresh } from "../../../../lib/realtime/use-realtime-refresh";

/**
 * Home: the web's `/` (src/app/(app)/(dashboard)/page.tsx). Every figure comes
 * computed from `GET /api/mobile/home` (the web Home's own `loadHome`); the
 * arrows browse months like the web's `?m=`. Budgets changing elsewhere
 * refresh it through Realtime, as the web page's <RealtimeRefresh tables={["budgets"]}>
 * does (transactions are the tab layout's).
 */
export default function HomeScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [month, setMonth] = useState<string | null>(null);
  const { state, notice, pulling, pull, reload } = useHome(month);
  // the chips of a month with no spending: the user's categories (not a figure)
  const categories = useResource("home-categories", (s) => loadResource(() => authFetch("/api/mobile/categories", s), parseCategories));
  useRealtimeRefresh(["budgets"]);
  // Crystal walks only while Home is in front and the app is active (the web pauses her with the tab hidden)
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setAppActive(s === "active"));
    return () => sub.remove();
  }, []);

  const go = (path: string) => router.push(path as Href);

  return (
    <Screen refreshing={pulling} onRefresh={() => void pull()}>
      {state.status === "loading" ? (
        <ScreenSkeleton />
      ) : state.status === "error" ? (
        <LoadFailure kind={state.kind} onRetry={() => void reload()} onSignOut={() => void signOut()} />
      ) : (
        <HomeView
          home={state.data}
          categories={categories.state.status === "ready" ? categories.state.data : null}
          name={displayName(session?.user.email)}
          hour={new Date().getHours()}
          go={go}
          onMonth={setMonth}
          // The add sheets arrive with Lane D (D2); until then both open the transaction form, income set to money in.
          onAddIncome={() =>
            router.push({
              pathname: "/transaction",
              params: { draft: JSON.stringify({ ...emptyDraft(state.data.today, null), direction: "credit" }) },
            })
          }
          onAddTransaction={() => router.push("/transaction")}
          notice={notice}
          onRefresh={() => void pull()}
          awake={focused && appActive}
        />
      )}
    </Screen>
  );
}
