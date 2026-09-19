import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { completeSessionFromUrl } from "../../lib/auth/complete-session-from-url";
import { colors } from "../../lib/theme";

/**
 * Landing screen for `budgts://auth/callback` when the OS opens the app
 * directly from the magic-link email (Google OAuth normally completes inline
 * in sign-in.tsx via `WebBrowser.openAuthSessionAsync`'s own result URL, but
 * Android may ALSO route the same URL here — `completeSessionFromUrl` is
 * deduplicated per URL so the single-use code is only exchanged once).
 * Mirrors `src/app/auth/callback/route.ts`.
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams();
  const [status, setStatus] = useState<"pending" | "done" | "error">("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const url = reconstructUrlFromParams(params) ?? Linking.getLinkingURL();
      if (!url) {
        if (!cancelled) {
          setStatus("error");
          setError("No callback data received");
        }
        return;
      }

      const result = await completeSessionFromUrl(url);
      if (cancelled) return;

      if (result.ok) {
        setStatus("done");
      } else {
        setStatus("error");
        setError(result.error);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "done") return <Redirect href="/" />;

  // The message travels to the sign-in screen, which renders it — it used to be
  // shown here for one frame and then redirected away (a silent failure).
  if (status === "error") {
    return (
      <Redirect
        href={{
          pathname: "/sign-in",
          params: { error: error ?? "Sign-in link is invalid or expired" },
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

/** Expo Router already parsed the query string into `params` by the time
 * this screen mounts on some platforms/cold-start paths; rebuild a URL
 * `parseAuthCallbackUrl` can read so both entry paths share one code path. */
function reconstructUrlFromParams(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") search.set(key, value);
  }
  const query = search.toString();
  return query ? `budgts://auth/callback?${query}` : null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.bg,
  },
});
