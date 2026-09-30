import { View } from "react-native";
import { Stack } from "expo-router";
import { useLoadingScreen } from "../../components/loading-screen";
import { FirstRunFailure } from "../../components/tour/first-run-failure";
import { useAuth } from "../../lib/auth/auth-context";
import { ROLE } from "../../lib/brand/shared";
import { profileFailure, shellRoute } from "../../lib/profile/gate";
import { ProfileProvider, useProfile } from "../../lib/profile/profile-context";
import { StatusProvider } from "../../lib/status/status-context";

/**
 * The signed-in shell. It loads the profile first, then applies the web's first-run gate (`shellRoute`, over
 * src/lib/tour/gate.ts): Get Started until a currency is saved, then the welcome guide until it is finished or skipped,
 * then the app. Each part of the app is its own protected set of screens, so the stack can only ever show the one the
 * gate allows (the welcome guide stays open after it is seen, for a replay from More). A failed profile read is a
 * visible state with Try again and Sign out, never a blank screen or a guess about the gate.
 */
function Gate() {
  const { state, reload } = useProfile();
  const { signOut } = useAuth();
  // The egg loader covers the profile load (components/loading-screen.tsx), continuing from start-up.
  useLoadingScreen(state.status === "loading", "Loading your account");

  if (state.status === "loading") return <View style={{ flex: 1, backgroundColor: ROLE.bg }} />;

  if (state.status === "error") {
    const f = profileFailure(state.kind);
    return (
      <FirstRunFailure
        kind={f.kind}
        detail={f.detail ? state.message : null}
        canRetry={f.canRetry}
        onRetry={() => void reload()}
        onSignOut={() => void signOut()}
      />
    );
  }

  const route = shellRoute(state.profile);
  return (
    <StatusProvider>
      {/* the first screen the gate allows is where the stack opens */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: ROLE.bg } }}>
        <Stack.Protected guard={route === "app"}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="transaction" options={{ presentation: "modal" }} />
          <Stack.Screen name="settings/delete-account" />
        </Stack.Protected>
        <Stack.Protected guard={route !== "onboarding"}>
          <Stack.Screen name="tour" />
        </Stack.Protected>
        <Stack.Protected guard={route === "onboarding"}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
      </Stack>
    </StatusProvider>
  );
}

export default function AppLayout() {
  return (
    <ProfileProvider>
      <Gate />
    </ProfileProvider>
  );
}
