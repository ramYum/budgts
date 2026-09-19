import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth/auth-context";
import { authFetch } from "../../lib/auth/api";
import { colors, fonts, radii } from "../../lib/theme";
import { OutlineButton, TextLink } from "../../components/ui";

/** Host of a public `EXPO_PUBLIC_*` URL (never a key) — for telling staging from production on a device. */
function hostOf(url: string | undefined): string {
  if (!url) return "not set";
  try {
    return new URL(url).host;
  } catch {
    return "invalid URL";
  }
}

/**
 * Account + device-verification tools. This is where the earlier "Check
 * backend session" control lives now that `/` is the real Home: it exercises
 * the Bearer-token transport end-to-end against `/api/mobile/session`. Sign
 * out lives here too.
 */
export default function DiagnosticsScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [result, setResult] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function checkBackendSession() {
    setResult(null);
    setChecking(true);
    try {
      const response = await authFetch("/api/mobile/session", session);
      const body = await response.json();
      setResult(response.ok ? `Backend sees: ${body.email}` : `Error: ${body.error}`);
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Request failed");
    } finally {
      setChecking(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <TextLink onPress={() => router.back()}>‹ Back to Home</TextLink>

          <View style={styles.block}>
            <Text style={styles.title} accessibilityRole="header">
              Account
            </Text>
            <Text style={styles.muted}>Signed in as {session?.user.email ?? "unknown"}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Check backend session</Text>
            <Text style={styles.muted}>
              Sends your session to the Budgts backend and shows who it says you are.
            </Text>
            <OutlineButton onPress={() => void checkBackendSession()} loading={checking}>
              Check backend session
            </OutlineButton>
            {result ? (
              <Text style={styles.result} accessibilityRole="alert">
                {result}
              </Text>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Environment</Text>
            <Text style={styles.muted}>API: {hostOf(process.env.EXPO_PUBLIC_API_BASE_URL)}</Text>
            <Text style={styles.muted}>Supabase: {hostOf(process.env.EXPO_PUBLIC_SUPABASE_URL)}</Text>
          </View>

          <OutlineButton onPress={() => void signOut()}>Sign out</OutlineButton>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: 24 },
  column: { width: "100%", maxWidth: 384, alignSelf: "center", gap: 16 },
  block: { gap: 4 },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  muted: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
  card: {
    gap: 10,
    padding: 16,
    borderRadius: radii.card / 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  result: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
});
