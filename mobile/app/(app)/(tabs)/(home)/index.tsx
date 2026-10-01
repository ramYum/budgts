import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useIsFocused, useRouter, type Href } from "expo-router";
import { LoadFailure } from "../../../../components/feedback/states";
import { ScreenSkeleton } from "../../../../components/feedback/skeleton";
import { HomeAddSheets, type HomeSheet } from "../../../../components/home/add-sheets";
import { HomeView } from "../../../../components/home/home-view";
import { Screen } from "../../../../components/shell/screen";
import { useAuth } from "../../../../lib/auth/auth-context";
import { useHome } from "../../../../lib/home/use-home";
import { displayName } from "../../../../lib/shared";
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
  useRealtimeRefresh(["budgets"]);
  // Crystal walks only while Home is in front and the app is active (the web pauses her with the tab hidden)
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setAppActive(s === "active"));
    return () => sub.remove();
  }, []);

  // Home's links are the web's navigations: into another tab they switch to it and apply the params (a Budgets or Activity
  // link never stacks a second copy of that screen, with its own load and realtime channel)
  const go = (href: Href) => router.navigate(href);
  // the add sheets open over Home, as Activity's do (web AddIncome / AddTransaction overlays)
  const [sheet, setSheet] = useState<HomeSheet | null>(null);

  return (
    <Screen refreshing={pulling} onRefresh={() => void pull()} name="home" notice={notice} onRetry={() => void pull()}>
      {state.status === "loading" ? (
        <ScreenSkeleton />
      ) : state.status === "error" ? (
        <LoadFailure kind={state.kind} onRetry={() => void reload()} onSignOut={() => void signOut()} />
      ) : (
        <HomeView
          home={state.data}
          name={displayName(session?.user.email)}
          hour={new Date().getHours()}
          go={go}
          onMonth={setMonth}
          onAddIncome={() => setSheet("income")}
          onAddTransaction={() => setSheet("add")}
          noticeShown={notice !== null}
          awake={focused && appActive}
        />
      )}
      {sheet && state.status === "ready" ? <HomeAddSheets sheet={sheet} defaultDate={state.data.today} onClose={() => setSheet(null)} /> : null}
    </Screen>
  );
}
