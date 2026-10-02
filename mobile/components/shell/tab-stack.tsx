import { Platform, View } from "react-native";
import { Stack } from "expo-router";
import { Backdrop } from "./backdrop";

// A new screen arrives the web's way (the page-enter rise, in <Screen>); iOS keeps its slide for swipe-back.
const ANIMATION = Platform.OS === "ios" ? "default" : "none";

/**
 * One tab's stack. Every screen in it is a <Screen> (components/shell/screen.tsx), which wears the signed-in header
 * over its own content, as every web dashboard page does (the header blurs what scrolls under it, so it sits with the
 * content it blurs), and keeps the tab bar below: a screen reached through More (Settings, Accounts, Help…) keeps More
 * lit, like the web's bottom nav.
 *
 * Screens paint nothing of their own: the shell's one backdrop shows through (app/(app)/(tabs)/_layout.tsx). Where a
 * pushed screen slides in over the one below (iOS), it carries its own copy of the same scene, drawn from the same
 * cached paths at the same place, so the page that slides is opaque and the one under it never shows through.
 */
export function TabStack() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" }, animation: ANIMATION }}
      screenLayout={({ route, navigation, children }) =>
        ANIMATION !== "none" && navigation.getState().routes[0]?.key !== route.key ? (
          <View style={{ flex: 1 }}>
            <Backdrop />
            {children}
          </View>
        ) : (
          children
        )
      }
    />
  );
}
