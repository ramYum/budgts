import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Redirect, useGlobalSearchParams, useRouter, type Href } from "expo-router";
import * as Linking from "expo-linking";
import { LinkProblem } from "../../components/auth/link-problem";
import { useLoadingScreen } from "../../components/loading-screen";
import { StandaloneShell } from "../../components/settings/standalone-shell";
import { takeReturnAfterSignIn } from "../../lib/account/delete-screen";
import { useAuth } from "../../lib/auth/auth-context";
import { callbackDecision, type CallbackDecision } from "../../lib/auth/callback-decision";
import { completeSessionFromUrl, type CompleteSessionResult } from "../../lib/auth/complete-session-from-url";
import { isAuthCallbackUrl } from "../../lib/auth/parse-callback-url";
import { takeSignInProblem, wasRejected } from "../../lib/auth/reauth-guard";
import { ROLE } from "../../lib/brand/shared";

/**
 * Landing screen for `budgts://auth/callback`: the email link (handed over by
 * the web page it opens, src/app/app/auth/callback) and, on Android, Google's
 * return as well (`completeSessionFromUrl` is deduplicated per URL, so the
 * single-use code is exchanged once). Mirrors `src/app/auth/callback/route.ts`.
 *
 * It reads the whole link the OS opened, fragment included: a failed link
 * carries its error there. Reachable signed in as well as signed out (a
 * fresh sign-in before deleting the account returns here); where it goes
 * next is lib/auth/callback-decision.ts: on, to what the sign-in left for
 * this account (takeReturnAfterSignIn), else Home; a signed-out failure back
 * to sign-in with its problem; a signed-in failure changes nothing and says
 * so, with a way back.
 */
export default function AuthCallbackScreen() {
  const params = useGlobalSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [outcome, setOutcome] = useState<CompleteSessionResult | null>(null);

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

  // Decided once: the return intent is taken, one-shot, only when the answer and the session are both in.
  const [decision, setDecision] = useState<CallbackDecision>({ kind: "wait" });
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current) return;
    const next = callbackDecision(outcome, userId, takeReturnAfterSignIn, wasRejected);
    if (next.kind === "wait") return;
    // sign-in gets the reason as its parameter; the guard's copy is spent
    if (next.kind === "sign-in" && next.problem === "other_account") takeSignInProblem();
    decided.current = true;
    setDecision(next);
  }, [outcome, userId]);

  // The egg loader covers the exchange (components/loading-screen.tsx).
  useLoadingScreen(decision.kind === "wait", "Signing you in");

  if (decision.kind === "go") return <Redirect href={decision.href as Href} />;
  if (decision.kind === "sign-in") return <Redirect href={{ pathname: "/sign-in", params: { problem: decision.problem } }} />;
  if (decision.kind === "problem") {
    const back = decision.back;
    return (
      <StandaloneShell>
        <LinkProblem problem={decision.problem} onBack={() => router.replace(back as Href)} />
      </StandaloneShell>
    );
  }

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
