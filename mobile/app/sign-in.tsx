import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "../lib/supabase/client";
import { isAppleSignInAvailable, signInWithAppleNative } from "../lib/auth/apple-native";
import { LINK_PROBLEM_MESSAGE, type AuthLinkProblem } from "../lib/auth/auth-errors";
import { buildAuthCallbackUrl } from "../lib/auth/callback-url";
import { completeSessionFromUrl } from "../lib/auth/complete-session-from-url";
import { sendEmailLink } from "../lib/auth/email-link";
import { signInWithGoogle } from "../lib/auth/google";
import { RESEND_AFTER_SECONDS, appleSignInEnabled, emailLinkRedirect } from "../lib/auth/sign-in-options";
import { legalUrl } from "../lib/legal";
import { useLegalLive } from "../lib/use-legal-links";
import { COLOR, FONT, ROLE, SPACE } from "../lib/brand/shared";
import { BrandStage } from "../components/brand/brand-stage";
import { Button, Field, IconTile, Rule, TextButton } from "../components/brand/controls";
import { PixelFrame } from "../components/brand/pixel-frame";
import { Text } from "../components/brand/text";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;
const APPLE_FLAG = appleSignInEnabled(process.env.EXPO_PUBLIC_APPLE_SIGN_IN);

type Pending = null | "email" | "google" | "apple";

function isProblem(value: unknown): value is AuthLinkProblem {
  return typeof value === "string" && value in LINK_PROBLEM_MESSAGE;
}

/**
 * Sign in: the web's sign-in screen (src/app/(auth)) drawn from the same brand
 * sources: the brand stage, then one raised card with the email link and
 * Google, plus Sign in with Apple on iOS once it is switched on
 * (sign-in-options.ts). A link that failed on its way back (expired, used,
 * from another device) lands here with its `problem`, shown above the form
 * that fixes it.
 */
export default function SignInScreen() {
  const params = useLocalSearchParams<{ problem?: string }>();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invalidEmail, setInvalidEmail] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const legalLive = useLegalLive(API_BASE);
  const field = useRef<TextInput>(null);

  useEffect(() => {
    if (Platform.OS !== "ios" || !APPLE_FLAG) return;
    void isAppleSignInAvailable()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  // Seeded into state (not read straight from params) so a new attempt clears it.
  useEffect(() => {
    if (isProblem(params.problem)) setError(LINK_PROBLEM_MESSAGE[params.problem]);
  }, [params.problem]);

  async function sendLink(address: string) {
    if (pending) return;
    setError(null);
    setInvalidEmail(false);
    setPending("email");
    try {
      const result = await sendEmailLink(address, {
        redirectTo: emailLinkRedirect(API_BASE),
        signInWithOtp: (args) => supabase.auth.signInWithOtp(args),
      });
      if (result.ok) setSentTo(result.email);
      else {
        setError(result.message);
        setInvalidEmail(!!result.invalidEmail);
      }
    } finally {
      setPending(null);
    }
  }

  async function google() {
    if (pending) return;
    setError(null);
    setPending("google");
    try {
      const result = await signInWithGoogle({
        redirectTo: buildAuthCallbackUrl(Linking.createURL),
        signInWithOAuth: (args) => supabase.auth.signInWithOAuth(args),
        openAuthSession: (url, returnUrl) => WebBrowser.openAuthSessionAsync(url, returnUrl),
        completeSession: completeSessionFromUrl,
      });
      // signed in: the auth listener moves the app on; cancelled: nothing to say
      if (result.status === "error") setError(result.message);
    } finally {
      setPending(null);
    }
  }

  async function apple() {
    if (pending) return;
    setError(null);
    setPending("apple");
    try {
      const result = await signInWithAppleNative();
      if (result.status === "error") setError(result.message);
      else if (result.status === "unavailable") setError("Sign in with Apple isn't available on this device.");
    } finally {
      setPending(null);
    }
  }

  const showApple = APPLE_FLAG && appleAvailable;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ROLE.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: SPACE.gutter,
            paddingTop: 24,
            paddingBottom: 40,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: "100%", maxWidth: 384, alignSelf: "center" }}>
            <View style={{ marginBottom: 32 }}>
              <BrandStage />
            </View>

            <PixelFrame frame="px-card-raised" style={{ padding: 20 }} testID="sign-in-card">
              {sentTo ? (
                <SentState
                  email={sentTo}
                  onResend={() => void sendLink(sentTo)}
                  resending={pending === "email"}
                  error={error}
                  onUseDifferentEmail={() => {
                    setSentTo(null);
                    setError(null);
                    setTimeout(() => field.current?.focus(), 0);
                  }}
                />
              ) : (
                <View style={{ gap: 24 }}>
                  <View style={{ gap: 4 }}>
                    <Text variant="heading" accessibilityRole="header">
                      Sign in
                    </Text>
                    <Text variant="body" color={ROLE.muted}>
                      Track spending against your budget.
                    </Text>
                  </View>

                  <View style={{ gap: 12 }}>
                    <Field
                      ref={field}
                      testID="sign-in-email"
                      label="Email"
                      placeholder="you@example.com"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      keyboardType="email-address"
                      returnKeyType="send"
                      value={email}
                      onChangeText={setEmail}
                      onSubmitEditing={() => void sendLink(email)}
                      editable={!pending}
                      invalid={invalidEmail}
                    />
                    {error ? (
                      <Text variant="formLabel" color={ROLE.neg} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="sign-in-error">
                        {error}
                      </Text>
                    ) : null}
                    <Button
                      testID="sign-in-email-send"
                      size="lg"
                      arrow={pending !== "email"}
                      disabled={pending !== null}
                      onPress={() => void sendLink(email)}
                    >
                      {pending === "email" ? "Sending…" : "Email me a sign-in link"}
                    </Button>
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Rule style={{ flex: 1 }} />
                    <Text variant="caption" color={ROLE.muted}>
                      or
                    </Text>
                    <Rule style={{ flex: 1 }} />
                  </View>

                  <View style={{ gap: 12 }}>
                    <Button
                      testID="sign-in-google"
                      variant="secondary"
                      size="lg"
                      icon="google"
                      loading={pending === "google"}
                      disabled={pending !== null && pending !== "google"}
                      onPress={() => void google()}
                    >
                      Continue with Google
                    </Button>
                    {showApple ? (
                      // Apple's own button (App Store guideline 4.8 / HIG), the same height as Google's.
                      <AppleAuthentication.AppleAuthenticationButton
                        testID="sign-in-apple"
                        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                        cornerRadius={0}
                        style={{ height: SPACE.buttonLg, width: "100%" }}
                        onPress={() => void apple()}
                      />
                    ) : null}
                  </View>

                  <Text variant="meta" color={ROLE.muted} testID="sign-in-same-account">
                    Already use Budgts on budgts.com? Sign in with the same email or Google account to keep your budget.
                    {showApple ? " With Sign in with Apple, Hide My Email starts a separate, new account." : ""}
                  </Text>
                </View>
              )}
            </PixelFrame>

            {legalLive ? <LegalLine /> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** "Check your email", with the exits the web's version lacks on a phone: send it again, or use another address. */
function SentState({
  email,
  onResend,
  resending,
  error,
  onUseDifferentEmail,
}: {
  email: string;
  onResend: () => void;
  resending: boolean;
  error: string | null;
  onUseDifferentEmail: () => void;
}) {
  const [wait, setWait] = useState(RESEND_AFTER_SECONDS);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  return (
    <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
      <IconTile name="mail" />
      <Text variant="heading" accessibilityRole="header">
        Check your email
      </Text>
      <Text variant="body" color={ROLE.muted} testID="sign-in-sent">
        We sent a sign-in link to {email}. Open it on this phone to sign in.
      </Text>
      {error ? (
        <Text variant="formLabel" color={ROLE.neg} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={{ gap: 4, marginTop: 4 }}>
        <TextButton
          testID="sign-in-resend"
          icon="mail"
          disabled={wait > 0 || resending}
          onPress={() => {
            setWait(RESEND_AFTER_SECONDS);
            onResend();
          }}
        >
          {resending ? "Sending…" : wait > 0 ? `Send it again in ${wait}s` : "Send it again"}
        </TextButton>
        <TextButton testID="sign-in-different-email" icon="edit" onPress={onUseDifferentEmail}>
          Use a different email
        </TextButton>
      </View>
    </View>
  );
}

/** The web's line under the sign-in card, once the legal pages are live. */
function LegalLine() {
  const open = (page: "terms" | "privacy") => {
    const url = legalUrl(API_BASE, page);
    if (url) void WebBrowser.openBrowserAsync(url);
  };
  const link = { fontFamily: FONT.geist[500], color: ROLE.ink, textDecorationLine: "underline" as const, textDecorationColor: COLOR.silver };
  return (
    <Text variant="meta" color={ROLE.muted} style={{ marginTop: 16, textAlign: "center" }}>
      By signing in you agree to the{" "}
      <Text variant="meta" style={link} onPress={() => open("terms")} accessibilityRole="link">
        Terms
      </Text>{" "}
      and{" "}
      <Text variant="meta" style={link} onPress={() => open("privacy")} accessibilityRole="link">
        Privacy policy
      </Text>
      .
    </Text>
  );
}
