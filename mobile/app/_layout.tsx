import { useEffect } from "react";
import { Stack } from "expo-router";
import { AuthProvider, useAuth } from "../lib/auth/auth-context";
import { registerSupabaseAutoRefresh } from "../lib/supabase/auto-refresh";

function RootNavigator() {
  const { session, loading } = useAuth();

  // Nothing rendered on the initial secure-storage read avoids a flash of
  // the sign-in screen for an already-authenticated user.
  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="auth/callback" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => registerSupabaseAutoRefresh(), []);

  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
