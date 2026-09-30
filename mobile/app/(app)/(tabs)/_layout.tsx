import { Tabs } from "expo-router";
import * as Haptics from "expo-haptics";
import { BottomTabs, TABS, type TabRoute } from "../../../components/shell/bottom-tabs";
import { useRealtimeRefresh } from "../../../lib/realtime/use-realtime-refresh";

/**
 * The signed-in app: the web's four tabs (Home, Budgets, Activity, More), each
 * its own stack under the shared header. The bar is ours (components/shell/
 * bottom-tabs.tsx), drawn like the web's; pressing the current tab again
 * returns its stack to the top, as the native stack does on a tab press.
 */
export default function TabsLayout() {
  // New bank rows (a background sync) or an edit on another device refresh every screen, like the web layout's <RealtimeRefresh>.
  useRealtimeRefresh(["transactions"]);

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => {
        const active = state.routes[state.index]!.name as TabRoute;
        return (
          <BottomTabs
            active={active}
            onSelect={(route) => {
              const target = state.routes.find((r) => r.name === route);
              if (!target) return;
              const event = navigation.emit({ type: "tabPress", target: target.key, canPreventDefault: true });
              if (route !== active && !event.defaultPrevented) {
                void Haptics.selectionAsync();
                navigation.navigate(route);
              }
            }}
          />
        );
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.route} name={t.route} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}
