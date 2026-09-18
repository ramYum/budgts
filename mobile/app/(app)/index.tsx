import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../lib/auth/auth-context";
import { authFetch } from "../../lib/auth/api";

/**
 * Placeholder authenticated home screen — this milestone is auth only
 * (docs/specs/2026-09-17-mobile-app-launch-design.md §13 step 6 covers the
 * real mobile IA later). "Check backend session" exercises the Bearer-token
 * transport end-to-end against `/api/mobile/session`.
 */
export default function HomeScreen() {
  const { session, signOut } = useAuth();
  const [result, setResult] = useState<string | null>(null);

  async function checkBackendSession() {
    setResult(null);
    try {
      const response = await authFetch("/api/mobile/session", session);
      const body = await response.json();
      setResult(response.ok ? `Backend sees: ${body.email}` : `Error: ${body.error}`);
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Request failed");
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Signed in</Text>
      <Text style={styles.subtitle}>{session?.user.email}</Text>

      <Pressable style={styles.button} onPress={checkBackendSession}>
        <Text style={styles.buttonText}>Check backend session</Text>
      </Pressable>
      {result ? <Text style={styles.result}>{result}</Text> : null}

      <Pressable style={styles.button} onPress={() => signOut()}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: "600" },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 12 },
  button: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { fontWeight: "600" },
  result: { fontSize: 13, color: "#333" },
});
