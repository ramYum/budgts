import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "../lib/supabase/client";
import { completeSessionFromUrl } from "../lib/auth/complete-session-from-url";

// Registered as the app's URL scheme in app.json ("scheme": "budgts") and as
// an allowed redirect URL in the Supabase project settings. Matches the
// `budgts://auth/callback` shape locked in
// docs/specs/2026-09-17-mobile-app-launch-design.md §4.
function redirectUri() {
  return Linking.createURL("/auth/callback");
}

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function sendMagicLink() {
    setError(null);
    setPending(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUri() },
    });
    setPending(false);
    if (otpError) {
      setError(otpError.message);
      return;
    }
    setSent(true);
  }

  async function signInWithGoogle() {
    setError(null);
    setPending(true);

    const redirectTo = redirectUri();
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });

    if (oauthError || !data.url) {
      setPending(false);
      setError(oauthError?.message ?? "Could not start Google sign-in");
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    setPending(false);

    if (result.type !== "success" || !result.url) {
      if (result.type !== "cancel" && result.type !== "dismiss") {
        setError("Google sign-in did not complete");
      }
      return;
    }

    const completion = await completeSessionFromUrl(result.url);
    if (!completion.ok) setError(completion.error);
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a sign-in link. Open it on this device to continue.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.subtitle}>Track spending against your budget.</Text>

      <TextInput
        style={styles.input}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={styles.primaryButton}
        onPress={sendMagicLink}
        disabled={pending || !email}
      >
        {pending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Email me a sign-in link</Text>
        )}
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={signInWithGoogle} disabled={pending}>
        <Text style={styles.secondaryButtonText}>Continue with Google</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: "600" },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  error: { color: "#c0392b", fontSize: 13 },
  primaryButton: {
    backgroundColor: "#111",
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: { color: "#fff", fontWeight: "600" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: { fontWeight: "600" },
});
