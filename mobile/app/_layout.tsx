import { useEffect } from "react";
import { SplashScreen, Stack } from "expo-router";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { AuthProvider, useAuth } from "../lib/auth/auth-context";
import { registerSupabaseAutoRefresh } from "../lib/supabase/auto-refresh";
import { colors } from "../lib/theme";

// Keep the native splash up until the session read and brand font are ready, so
// there is no flash of an unstyled (system-font) or wrong-screen first frame.
SplashScreen.preventAutoHideAsync();

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { session, loading } = useAuth();
  const ready = fontsReady && !loading;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Nothing rendered on the initial secure-storage read avoids a flash of
  // the sign-in screen for an already-authenticated user.
  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
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
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => registerSupabaseAutoRefresh(), []);

  return (
    <AuthProvider>
      {/* A font failure must not brick sign-in: fall back to the system font. */}
      <RootNavigator fontsReady={fontsLoaded || !!fontError} />
    </AuthProvider>
  );
}
