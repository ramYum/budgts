import { Tabs } from "expo-router";
import { colors, fonts } from "../../../lib/theme";

/**
 * The signed-in shell. Home, Activity, Budgets and Settings; Accounts is reached from Activity / Settings rather than its own
 * tab (docs/specs/2026-09-21-mobile-only-transition-design.md §4). Labels only — no icon pack dependency.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 13 },
        tabBarIcon: () => null,
        tabBarIconStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarButtonTestID: "tab-home" }} />
      <Tabs.Screen name="activity" options={{ title: "Activity", tabBarButtonTestID: "tab-activity" }} />
      <Tabs.Screen name="budgets" options={{ title: "Budgets", tabBarButtonTestID: "tab-budgets" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarButtonTestID: "tab-settings" }} />
    </Tabs>
  );
}
