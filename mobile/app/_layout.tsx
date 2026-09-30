import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { LoadingScreenProvider } from "../components/loading-screen";
import { AuthProvider, useAuth } from "../lib/auth/auth-context";
import { FONT_SOURCES } from "../lib/brand/fonts";
import { ROLE } from "../lib/brand/shared";
import { registerSupabaseAutoRefresh } from "../lib/supabase/auto-refresh";
import { SPLASH_FADE_MS, loaderMotionAfterMs } from "../lib/brand/splash-motion";

// The native splash (app.json → expo-splash-screen: the resting egg on paper).
// iOS: it stays up until the loading screen has laid out the very same egg in
// the very same place, then fades over it, and the egg rolls. Android: the
// app window's own background is that egg on paper
// (plugins/with-android-launch-egg.js), so the splash leaves at the window's
// first frame and nothing waits on JavaScript; the loader then draws the same
// egg over it and rolls straight away. `fade` is an iOS switch.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: SPLASH_FADE_MS });

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { session, loading } = useAuth();
  const ready = fontsReady && !loading;

  // The egg stands still, exactly as the splash shows it, until the splash
  // is told to go; it starts rolling once the splash has faded off it.
  const splashHidden = useRef(false);
  const [splashGone, setSplashGone] = useState(false);
  const hideSplash = useCallback(() => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    SplashScreen.hide();
    setSplashGone(true);
  }, []);

  // Until the session read and the brand fonts are ready the loading screen
  // covers everything: no flash of the sign-in screen for a signed-in user,
  // nor of a system font.
  return (
    <LoadingScreenProvider loading={!ready} onLayout={hideSplash} motionAfterMs={loaderMotionAfterMs(Platform.OS, splashGone)}>
      {ready ? (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: ROLE.bg } }}>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
          {/* Signed in too: a fresh sign-in before deleting the account returns here (app/auth/callback.tsx). */}
          <Stack.Screen name="auth/callback" />
          <Stack.Protected guard={!!session}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          {/* Development builds only: every brand primitive on one screen, for parity captures (budgts://dev/brand). */}
          <Stack.Protected guard={__DEV__}>
            <Stack.Screen name="dev/brand" />
          </Stack.Protected>
        </Stack>
      ) : null}
    </LoadingScreenProvider>
  );
}

export default function RootLayout() {
  // The web's own font files (src/app/fonts), bundled into the app.
  const [fontsLoaded, fontError] = useFonts(FONT_SOURCES);

  useEffect(() => registerSupabaseAutoRefresh(), []);

  return (
    <AuthProvider>
      {/* dark status-bar marks on the light canvas (the app is light only) */}
      <StatusBar style="dark" />
      {/* A font failure must not brick sign-in: fall back to the system font. */}
      <RootNavigator fontsReady={fontsLoaded || !!fontError} />
    </AuthProvider>
  );
}
