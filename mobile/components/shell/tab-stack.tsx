import { Platform } from "react-native";
import { Stack, useRouter } from "expo-router";
import { ROLE } from "../../lib/brand/shared";
import { useStatus } from "../../lib/status/status-context";
import { AppHeader } from "./app-header";

function ShellHeader({ translucent }: { translucent: boolean }) {
  const router = useRouter();
  const status = useStatus();
  return (
    <AppHeader
      needsCategoryCount={status?.needsCategoryCount ?? null}
      onHome={() => router.navigate("/")}
      onBell={() => router.navigate("/activity")}
      translucent={translucent}
    />
  );
}

/**
 * One tab's stack. Every screen in it wears the signed-in header, as every web
 * dashboard page does, and keeps the tab bar below: a screen reached through
 * More (Settings, Accounts, Help…) keeps More lit, like the web's bottom nav.
 */
export function TabStack() {
  return (
    <Stack
      screenOptions={{
        header: ({ options }) => <ShellHeader translucent={options.headerTransparent === true} />,
        contentStyle: { backgroundColor: ROLE.bg },
        // A new screen arrives the web's way (the page-enter rise, in <Screen>); iOS keeps its slide for swipe-back.
        animation: Platform.OS === "ios" ? "default" : "none",
      }}
    />
  );
}
