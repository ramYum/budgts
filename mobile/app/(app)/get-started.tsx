import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth/auth-context";
import { useProfile } from "../../lib/profile/profile-context";
import { colors, fonts, radii } from "../../lib/theme";
import { PrimaryButton, TextLink } from "../../components/ui";

/**
 * Get Started (first run). Today it does the one thing a new native account cannot skip: choosing the currency every
 * amount will be shown in (set once, like on the web). Connecting a bank and starting the trial join this flow as those
 * screens are built; "Show me around" stays optional (docs/specs/2026-09-21-mobile-only-transition-design.md §1).
 */
export default function GetStartedScreen() {
  const { state, chooseCurrency } = useProfile();
  const { signOut } = useAuth();
  const profile = state.status === "ready" ? state.profile : null;

  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile) return null; // the app shell only renders this once the profile has loaded

  const currency = selected ?? profile.currency;

  const onContinue = async () => {
    setSaving(true);
    setError(null);
    const result = await chooseCurrency(currency);
    // On success the shell moves to the app on its own; only a failure needs a message.
    if (result.status === "error") {
      setError(result.message);
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title} accessibilityRole="header">
          Welcome to Budgts
        </Text>
        <Text style={styles.lead}>Which currency should Budgts use? This is set once, so every amount stays consistent.</Text>

        <View style={styles.list} accessibilityRole="radiogroup">
          {profile.supportedCurrencies.map((c) => {
            const on = c === currency;
            return (
              <Pressable
                key={c}
                testID={`currency-${c}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setSelected(c)}
                style={[styles.option, on && styles.optionOn]}
              >
                <Text style={[styles.optionText, on && styles.optionTextOn]}>{c}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <PrimaryButton testID="get-started-continue" onPress={() => void onContinue()} loading={saving}>
          Continue
        </PrimaryButton>
        <TextLink testID="get-started-sign-out" onPress={() => void signOut()}>
          Sign out
        </TextLink>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, gap: 16 },
  title: { fontFamily: fonts.bold, fontSize: 28, color: colors.text },
  lead: { fontFamily: fonts.regular, fontSize: 15, color: colors.muted, lineHeight: 22 },
  list: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  option: {
    minWidth: 76,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  optionOn: { backgroundColor: colors.primaryBtn, borderColor: colors.primaryBtn },
  optionText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  optionTextOn: { fontFamily: fonts.semibold },
  error: { fontFamily: fonts.medium, fontSize: 14, color: colors.neg },
});
