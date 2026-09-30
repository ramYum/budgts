import { useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
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
import { resendWaitSeconds, sendEmailLink } from "../lib/auth/email-link";
import { signInWithGoogle } from "../lib/auth/google";
import { appleSignInEnabled } from "../lib/auth/sign-in-options";
import { scrollTargetAboveKeyboard } from "../lib/keyboard";
import { legalUrl } from "../lib/legal";
import { useLegalLive } from "../lib/use-legal-links";
import { COLOR, FONT, ROLE, SPACE } from "../lib/brand/shared";
import { BrandStage } from "../components/brand/brand-stage";
import { Button, Field, Rule } from "../components/brand/controls";
import { PixelFrame } from "../components/brand/pixel-frame";
import { Text } from "../components/brand/text";
import { SignInEntrance } from "../components/sign-in/entrance";
import { SentState } from "../components/sign-in/sent-state";
import { takeSignInProblem } from "../lib/auth/reauth-guard";

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
  // `key` restarts the countdown after every attempt, even one with the same wait
  const [resendWait, setResendWait] = useState({ seconds: 0, key: 0 });
  const [appleAvailable, setAppleAvailable] = useState(false);
  const legalLive = useLegalLive(API_BASE);
  const field = useRef<TextInput>(null);
  // Keeps the email field and its send button above the keyboard on short
  // screens: Android's edge-to-edge window doesn't resize for the keyboard, and
  // focusing the field alone scrolls just enough to show part of it. Measured
  // in the scroll content's own coordinates, so an in-flight scroll (the
  // system's, or ours) can't skew the target; checked when the keyboard
  // appears and again when KeyboardAvoidingView shortens the scroll view.
  const scroll = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const viewport = useRef<View>(null);
  const column = useRef<View>(null);
  const columnY = useRef(0);
  const form = useRef<View>(null);
  const keyboardTop = useRef<number | null>(null);
  function keepFormAboveKeyboard() {
    const top = keyboardTop.current;
    if (top === null || !viewport.current || !column.current || !form.current) return;
    viewport.current.measureInWindow((_x, viewTop) => {
      form.current?.measureLayout(column.current!, (_fx, formY, _fw, formH) => {
        const target = scrollTargetAboveKeyboard(columnY.current + formY + formH, top - viewTop);
        if (target > scrollY.current) scroll.current?.scrollTo({ y: target, animated: true });
      });
    });
  }
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
      keepFormAboveKeyboard();
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTop.current = null;
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "ios" || !APPLE_FLAG) return;
    void isAppleSignInAvailable()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  // Seeded into state (not read straight from params) so a new attempt clears it. A re-sign-in refused for being
  // another account (lib/auth/reauth-guard.ts) signs the phone out and lands here without a parameter: its reason too.
  useEffect(() => {
    const problem = isProblem(params.problem) ? params.problem : takeSignInProblem();
    if (problem) setError(LINK_PROBLEM_MESSAGE[problem]);
  }, [params.problem]);

  async function sendLink(address: string) {
    if (pending) return;
    setError(null);
    setInvalidEmail(false);
    setPending("email");
    try {
      const result = await sendEmailLink(address, {
        apiBaseUrl: API_BASE,
        signInWithOtp: (args) => supabase.auth.signInWithOtp(args),
      });
      // the resend countdown follows the server's own wait when it names one
      setResendWait((w) => ({ seconds: resendWaitSeconds(result), key: w.key + 1 }));
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
      {/* padding on both: with Android's edge-to-edge the window no longer resizes for the keyboard */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View ref={viewport} style={{ flex: 1 }}>
          <ScrollView
            ref={scroll}
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            onLayout={keepFormAboveKeyboard}
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
            <View
              ref={column}
              onLayout={(e) => {
                columnY.current = e.nativeEvent.layout.y;
              }}
              style={{ width: "100%", maxWidth: 384, alignSelf: "center" }}
            >
              <SignInEntrance stage={<BrandStage />} legal={legalLive ? <LegalLine /> : null}>
                <PixelFrame frame="px-card-raised" style={{ padding: 20 }} testID="sign-in-card">
                  {sentTo ? (
                    <SentState
                      email={sentTo}
                      onResend={() => void sendLink(sentTo)}
                      waitSeconds={resendWait.seconds}
                      waitKey={resendWait.key}
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

                      <View style={{ gap: 12 }} ref={form}>
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
              </SignInEntrance>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
