import { useEffect, useState } from "react";
import { View } from "react-native";
import { Redirect, useGlobalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { useLoadingScreen } from "../../components/loading-screen";
import type { AuthLinkProblem } from "../../lib/auth/auth-errors";
import { completeSessionFromUrl } from "../../lib/auth/complete-session-from-url";
import { isAuthCallbackUrl } from "../../lib/auth/parse-callback-url";
import { ROLE } from "../../lib/brand/shared";

/**
 * Landing screen for `budgts://auth/callback`: the email link (handed over by
 * the web page it opens, src/app/app/auth/callback) and, on Android, Google's
 * return as well (`completeSessionFromUrl` is deduplicated per URL, so the
 * single-use code is exchanged once). Mirrors `src/app/auth/callback/route.ts`.
 *
 * It reads the whole link the OS opened, fragment included: a failed link
 * carries its error there. A failure goes back to sign-in with its problem,
 * where the message sits above the form that fixes it (auth-errors.ts).
 */
export default function AuthCallbackScreen() {
  const params = useGlobalSearchParams();
  const [outcome, setOutcome] = useState<{ ok: true } | { ok: false; problem: AuthLinkProblem } | null>(null);

  // Chosen once: the single-use code must be exchanged for exactly one URL.
  const [url] = useState(() => {
    const opened = Linking.getLinkingURL();
    return isAuthCallbackUrl(opened) ? opened : fromParams(params);
  });

  useEffect(() => {
    let cancelled = false;
    void completeSessionFromUrl(url).then((result) => {
      if (!cancelled) setOutcome(result);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // The egg loader covers the exchange (components/loading-screen.tsx).
  useLoadingScreen(!outcome, "Signing you in");

  if (outcome?.ok) return <Redirect href="/" />;
  if (outcome && !outcome.ok) return <Redirect href={{ pathname: "/sign-in", params: { problem: outcome.problem } }} />;

  return <View style={{ flex: 1, backgroundColor: ROLE.bg }} />;
}

/** The route's parameters as a return URL, when the OS's link isn't at hand (Expo Router parsed it already). */
function fromParams(params: Record<string, string | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") search.set(key, value);
  }
  const query = search.toString();
  return query ? `budgts://auth/callback?${query}` : "budgts://auth/callback";
}
