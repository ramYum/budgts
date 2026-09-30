import { Stack, useRouter } from "expo-router";
import { ROLE } from "../../lib/brand/shared";
import { useStatus } from "../../lib/status/status-context";
import { AppHeader } from "./app-header";

function ShellHeader() {
  const router = useRouter();
  const status = useStatus();
  return (
    <AppHeader
      needsCategoryCount={status?.needsCategoryCount ?? null}
      onHome={() => router.navigate("/")}
      onBell={() => router.navigate("/activity")}
    />
  );
}

/**
 * One tab's stack. Every screen in it wears the signed-in header, as every web
 * dashboard page does, and keeps the tab bar below: a screen reached through
 * More (Settings, Accounts, Help…) keeps More lit, like the web's bottom nav.
 */
export function TabStack() {
  return <Stack screenOptions={{ header: () => <ShellHeader />, contentStyle: { backgroundColor: ROLE.bg } }} />;
}
