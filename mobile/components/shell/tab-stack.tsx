import { Platform } from "react-native";
import { Stack } from "expo-router";
import { ROLE } from "../../lib/brand/shared";

/**
 * One tab's stack. Every screen in it is a <Screen> (components/shell/screen.tsx), which wears the signed-in header
 * over its own content, as every web dashboard page does (the header blurs what scrolls under it, so it sits with the
 * content it blurs), and keeps the tab bar below: a screen reached through More (Settings, Accounts, Help…) keeps More
 * lit, like the web's bottom nav.
 */
export function TabStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: ROLE.bg },
        // A new screen arrives the web's way (the page-enter rise, in <Screen>); iOS keeps its slide for swipe-back.
        animation: Platform.OS === "ios" ? "default" : "none",
      }}
    />
  );
}
