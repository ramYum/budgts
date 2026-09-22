import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useAuth } from "../../lib/auth/auth-context";
import { ProfileProvider, useProfile } from "../../lib/profile/profile-context";
import { colors, fonts, radii } from "../../lib/theme";
import { OutlineButton, PrimaryButton } from "../../components/ui";

/**
 * The signed-in shell. It loads the profile first: a user who has not chosen a currency (a native-only signup) is held on
 * Get Started; everyone else gets the tabs. A failed profile load is a visible, retryable state — never a blank screen or a
 * guess about whether onboarding is done.
 */
function Gate() {
  const { state, reload } = useProfile();
  const { signOut } = useAuth();

  if (state.status === "loading") {
    return (
      <View style={styles.centered} accessibilityLabel="Loading your account">
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (state.status === "error") {
    const canRetry = state.kind !== "auth" && state.kind !== "profile_missing";
    return (
      <View style={styles.centered}>
        <View style={styles.card} accessibilityRole="alert">
          <Text style={styles.title}>Can&apos;t open your account</Text>
          <Text style={styles.body}>{state.message}</Text>
          {canRetry ? (
            <PrimaryButton testID="shell-retry" onPress={() => void reload()}>
              Try again
            </PrimaryButton>
          ) : null}
          <OutlineButton testID="shell-sign-out" onPress={() => void signOut()}>
            Sign out
          </OutlineButton>
        </View>
      </View>
    );
  }

  const onboarded = state.profile.onboarded;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="get-started" />
      </Stack.Protected>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="transaction" options={{ presentation: "modal" }} />
        <Stack.Screen name="accounts" />
        <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
        <Stack.Screen name="delete-account" />
        <Stack.Screen name="diagnostics" />
      </Stack.Protected>
    </Stack>
  );
}

export default function AppLayout() {
  return (
    <ProfileProvider>
      <Gate />
    </ProfileProvider>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: 24 },
  card: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radii.field,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 12,
  },
  title: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, lineHeight: 20 },
});
