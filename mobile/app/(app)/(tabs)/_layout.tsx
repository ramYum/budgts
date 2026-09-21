import { Tabs } from "expo-router";
import { colors, fonts } from "../../../lib/theme";

/**
 * The signed-in shell. Home and Settings for now; Transactions, Budgets and Accounts join as they are built
 * (docs/specs/2026-09-21-mobile-only-transition-design.md §4). Labels only — no icon pack dependency.
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
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarButtonTestID: "tab-settings" }} />
    </Tabs>
  );
}
