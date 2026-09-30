import { useEffect, useRef, useState } from "react";
import { BackHandler, Linking, Platform } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import * as ExpoLinking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { ScreenSkeleton } from "../../../components/feedback/skeleton";
import { LoadFailure } from "../../../components/feedback/states";
import { DeleteAccountFlow, type DeleteFlowActions } from "../../../components/settings/delete-account-flow";
import { StandaloneShell } from "../../../components/settings/standalone-shell";
import { requestAccountDeletion } from "../../../lib/account/delete-account";
import {
  parseDeleteScreen,
  requestReauthLink,
} from "../../../lib/account/delete-screen";
import { loadResource } from "../../../lib/api/load";
import { useResource } from "../../../lib/api/use-resource";
import { authFetch } from "../../../lib/auth/api";
import { useAuth } from "../../../lib/auth/auth-context";
import { buildAuthCallbackUrl } from "../../../lib/auth/callback-url";
import { completeSessionFromUrl } from "../../../lib/auth/complete-session-from-url";
import { signInWithGoogle } from "../../../lib/auth/google";
import { expectReauthAs } from "../../../lib/auth/reauth-guard";
import { returnAfterSignIn } from "../../../lib/auth/return-intent";
import { legalUrl } from "../../../lib/legal";
import { ACCOUNT_DELETED_PATH, DELETE_ACCOUNT_CONFIRM_PATH, DELETE_ACCOUNT_PATH } from "../../../lib/shared";
import { supabase } from "../../../lib/supabase/client";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;

/**
 * Settings → Delete account (web /settings/delete-account): a standalone screen, outside the tabs, reachable before
 * onboarding is finished, as on the web. Its first state comes from `GET /api/mobile/account/delete`; the deletion is
 * `POST /api/account/delete` (lib/account/delete-account.ts), which re-checks everything. A fresh sign-in (Google in
 * place, or the email link that returns here) changes the session's sign-in time, and the state is read again.
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const { step } = useLocalSearchParams<{ step?: string }>();
  const { session, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const { state, reload, refresh } = useResource("delete-screen", (s) =>
    loadResource(() => authFetch("/api/mobile/account/delete", s), parseDeleteScreen),
  );

  // A fresh sign-in: read the state again, quietly, so a flow waiting on it moves on to confirm.
  const signedInAt = session?.user.last_sign_in_at ?? null;
  const seen = useRef(signedInAt);
  useEffect(() => {
    if (signedInAt === seen.current) return;
    seen.current = signedInAt;
    void refresh();
  }, [signedInAt, refresh]);

  // Leaving mid-deletion doesn't stop it on the server, but the answer would be lost: Android's back waits.
  useEffect(() => {
    if (!busy) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [busy]);

  const toSettings = () => (router.canGoBack() ? router.back() : router.navigate("/settings"));

  function content() {
    if (state.status === "loading") return <ScreenSkeleton />;
    if (state.status === "error") {
      return <LoadFailure kind={state.kind} onRetry={() => void reload()} onHome={toSettings} onSignOut={() => void signOut()} />;
    }
    const screen = state.data;
    const actions: DeleteFlowActions = {
      deleteAccount: () =>
        requestAccountDeletion(Platform.OS === "android" ? "google" : "apple", () =>
          authFetch("/api/account/delete", session, { method: "POST" }),
        ),
      onDeleted: (store) => {
        const params = new URLSearchParams();
        if (store) params.set("store", "1");
        if (screen.keepsRecords) params.set("keeps", "1");
        if (screen.supportEmail) params.set("legal", "1");
        const query = params.toString();
        router.replace((query ? `${ACCOUNT_DELETED_PATH}?${query}` : ACCOUNT_DELETED_PATH) as Href);
        // The server has revoked the session already; this clears the device's copy.
        void signOut();
      },
      sendReauthLink: async () => {
        if (session) await expectReauthAs(session.user.id);
        const result = await requestReauthLink(screen.email, {
          apiBaseUrl: API_BASE,
          signInWithOtp: (args) => supabase.auth.signInWithOtp(args),
        });
        if (result.sent && session) await returnAfterSignIn(DELETE_ACCOUNT_CONFIRM_PATH, session.user.id);
        return result;
      },
      reauthWithGoogle: async () => {
        if (session) await expectReauthAs(session.user.id);
        const result = await signInWithGoogle({
          redirectTo: buildAuthCallbackUrl(ExpoLinking.createURL),
          signInWithOAuth: (args) => supabase.auth.signInWithOAuth(args),
          openAuthSession: (url, returnUrl) => WebBrowser.openAuthSessionAsync(url, returnUrl),
          completeSession: completeSessionFromUrl,
        });
        return result.status === "error" ? result.message : null;
      },
      onKeep: toSettings,
      onConnectedBanks: () => router.push("/connected-banks"),
      onSignInAgain: () => {
        void (async () => {
          if (session) await returnAfterSignIn(DELETE_ACCOUNT_PATH, session.user.id);
          await signOut();
        })();
      },
      openUrl: (url) => void (url.startsWith("mailto:") ? Linking.openURL(url) : WebBrowser.openBrowserAsync(url)),
      deletionPageUrl: screen.supportEmail ? legalUrl(API_BASE, "accountDeletion") : null,
      onBusy: setBusy,
    };
    return <DeleteAccountFlow screen={screen} step={step === "confirm" ? "confirm" : "intro"} actions={actions} />;
  }

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <StandaloneShell align="top" onHome={busy ? undefined : () => router.navigate("/")}>
        {content()}
      </StandaloneShell>
    </>
  );
}
