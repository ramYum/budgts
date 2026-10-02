import { useState } from "react";
import { View } from "react-native";
import { DefaultTheme, Tabs, ThemeProvider } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Backdrop, BackdropProvider } from "../../../components/shell/backdrop";
import { BottomTabs, TABS, tabBarHeight, type TabRoute } from "../../../components/shell/bottom-tabs";
import { useRealtimeRefresh } from "../../../lib/realtime/use-realtime-refresh";

/** The navigators inside the tab shell paint nothing of their own (tabs' scenes, each stack's container and screens): the backdrop shows through. */
const OVER_BACKDROP = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: "transparent" } };

/**
 * The signed-in app: the web's four tabs (Home, Budgets, Activity, More), each
 * its own stack under the shared header. The bar is ours (components/shell/
 * bottom-tabs.tsx), drawn like the web's; pressing the current tab again
 * returns its stack to the top, as the native stack does on a tab press.
 * Behind it all, once for the whole shell, Crystal's sunset forest
 * (components/shell/backdrop.tsx), its meadow just above the bar's measured top.
 */
export default function TabsLayout() {
  // New bank rows (a background sync) or an edit on another device refresh every screen, like the web layout's <RealtimeRefresh>.
  useRealtimeRefresh(["transactions"]);
  const insets = useSafeAreaInsets();
  // The bar's laid-out height; until it has laid out, the height it lays out to at the default text size.
  const [barLaidOut, setBarLaidOut] = useState<number | null>(null);

  return (
    <BackdropProvider barHeight={barLaidOut ?? tabBarHeight(insets.bottom)}>
      <View style={{ flex: 1 }}>
        <Backdrop />
        <ThemeProvider value={OVER_BACKDROP}>
          <Tabs
            screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" } }}
            tabBar={({ state, navigation }) => {
              const active = state.routes[state.index]!.name as TabRoute;
              return (
                <BottomTabs
                  active={active}
                  onLayout={(e) => {
                    const h = e.nativeEvent.layout.height;
                    setBarLaidOut((prev) => (prev === h ? prev : h));
                  }}
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
        </ThemeProvider>
      </View>
    </BackdropProvider>
  );
}
