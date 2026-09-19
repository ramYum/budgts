import { useEffect, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "../lib/supabase/client";
import { buildAuthCallbackUrl } from "../lib/auth/callback-url";
import { completeSessionFromUrl } from "../lib/auth/complete-session-from-url";
import { isPlausibleEmail, normalizeEmail } from "../lib/auth/email";
import { colors, fonts, radii } from "../lib/theme";
import { OutlineButton, PrimaryButton, TextLink } from "../components/ui";

// `budgts://auth/callback` — the app's URL scheme (app.json "scheme") plus the
// path, and the EXACT string that must be in Supabase's redirect allow-list
// (docs/specs/2026-09-17-mobile-app-launch-design.md §4). Built through
// `buildAuthCallbackUrl` because `Linking.createURL("/auth/callback")` yields a
// triple-slash URL that Supabase rejects, silently sending the Magic Link to
// the web app instead. See lib/auth/callback-url.test.ts.
function redirectUri() {
  return buildAuthCallbackUrl(Linking.createURL);
}

type Pending = null | "email" | "google";

export default function SignInScreen() {
  // `error` arrives here when a deep-link callback failed (expired/used link,
  // link opened on a different device) — see app/auth/callback.tsx.
  const params = useLocalSearchParams<{ error?: string }>();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  // Seeded into state (not read straight from params) so retrying clears it.
  useEffect(() => {
    if (typeof params.error === "string") setError(params.error);
  }, [params.error]);

  const cleanEmail = normalizeEmail(email);
  const canSend = isPlausibleEmail(cleanEmail);
  const shownError = error;

  async function sendMagicLink() {
    if (!canSend || pending) return;
    setError(null);
    setPending("email");
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { emailRedirectTo: redirectUri() },
      });
      if (otpError) {
        setError(otpError.message);
        return;
      }
      setSentTo(cleanEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the sign-in link");
    } finally {
      setPending(null);
    }
  }

  async function signInWithGoogle() {
    if (pending) return;
    setError(null);
    setPending("google");
    try {
      const redirectTo = redirectUri();
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });

      if (oauthError || !data.url) {
        setError(oauthError?.message ?? "Could not start Google sign-in");
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type !== "success" || !result.url) {
        if (result.type !== "cancel" && result.type !== "dismiss") {
          setError("Google sign-in did not complete");
        }
        return;
      }

      const completion = await completeSessionFromUrl(result.url);
      if (!completion.ok) setError(completion.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.column}>
            {sentTo ? (
              <SentState
                email={sentTo}
                onUseDifferentEmail={() => {
                  setSentTo(null);
                  setError(null);
                }}
              />
            ) : (
              <>
                <View style={styles.stage}>
                  <Image
                    source={require("../assets/brand/logo-sunburst.png")}
                    style={styles.logo}
                    resizeMode="contain"
                    accessibilityLabel="Budgts — a brighter way to budget"
                  />
                </View>

                <View style={styles.headingBlock}>
                  <Text style={styles.title} accessibilityRole="header">
                    Sign in
                  </Text>
                  <Text style={styles.subtitle}>Track spending against your budget.</Text>
                </View>

                <View style={styles.form}>
                  <View style={styles.fieldBlock}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="you@example.com"
                      placeholderTextColor={colors.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      keyboardType="email-address"
                      returnKeyType="send"
                      value={email}
                      onChangeText={setEmail}
                      onSubmitEditing={sendMagicLink}
                      editable={!pending}
                    />
                  </View>

                  {shownError ? (
                    <Text style={styles.error} accessibilityRole="alert">
                      {shownError}
                    </Text>
                  ) : null}

                  <PrimaryButton
                    onPress={sendMagicLink}
                    disabled={!canSend || pending === "google"}
                    loading={pending === "email"}
                  >
                    Email me a sign-in link
                  </PrimaryButton>
                </View>

                <View style={styles.divider}>
                  <View style={styles.rule} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.rule} />
                </View>

                <OutlineButton
                  onPress={signInWithGoogle}
                  disabled={pending === "email"}
                  loading={pending === "google"}
                >
                  Continue with Google
                </OutlineButton>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** "Check your email" — mirrors the web state, plus the reachable exit the
 * placeholder lacked (a mistyped address used to be a dead end). */
function SentState({
  email,
  onUseDifferentEmail,
}: {
  email: string;
  onUseDifferentEmail: () => void;
}) {
  return (
    <View style={styles.sent}>
      <View style={styles.stage}>
        <Image
          source={require("../assets/brand/mood-happy.png")}
          style={styles.sentMascot}
          resizeMode="contain"
          accessibilityLabel="Budgts robin mascot"
        />
      </View>
      <View style={styles.headingBlock}>
        <Text style={[styles.title, styles.center]} accessibilityRole="header">
          Check your email
        </Text>
        <Text style={[styles.subtitle, styles.center]}>
          We sent a sign-in link to {email}. Open it on this phone and Budgts will open
          automatically.
        </Text>
      </View>
      <TextLink onPress={onUseDifferentEmail}>Use a different email</TextLink>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  column: { width: "100%", maxWidth: 384, alignSelf: "center", gap: 24 },
  stage: {
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  logo: { width: 240, height: 240 },
  sentMascot: { width: 140, height: 132 },
  headingBlock: { gap: 4 },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  subtitle: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.muted },
  center: { textAlign: "center" },
  form: { gap: 12 },
  fieldBlock: { gap: 4 },
  label: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.field,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },
  error: { fontFamily: fonts.regular, fontSize: 13, color: colors.neg },
  divider: { flexDirection: "row", alignItems: "center", gap: 12 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dividerText: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  sent: { gap: 24 },
});
