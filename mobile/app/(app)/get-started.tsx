import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth/auth-context";
import { authFetch } from "../../lib/auth/api";
import { jsonInit } from "../../lib/api/request";
import { connectBank } from "../../lib/plaid/link-flow";
import { createPlaidLinkClient, currentPlatform } from "../../lib/plaid/plaid-link-native";
import { useProfile } from "../../lib/profile/profile-context";
import { colors, fonts, radii } from "../../lib/theme";
import { PrimaryButton, TextLink } from "../../components/ui";

/**
 * Get Started (first run): currency, then an optional "connect your bank" step, matching the approved direction —
 * Get Started with no forced tour (docs/specs/2026-09-21-mobile-only-transition-design.md §1). Both steps are local to
 * this screen; the currency save (the only thing the server's "onboarded" flag tracks) happens once, at the end, so
 * the app shell's gate swaps to the signed-in app only after the whole sequence finishes. "Show me around" stays a
 * separate, optional, not-yet-built follow-on — this flow does not block on it.
 */
type Step = "currency" | "bank";

export default function GetStartedScreen() {
  const { state, chooseCurrency } = useProfile();
  const { session, signOut } = useAuth();
  const profile = state.status === "ready" ? state.profile : null;

  const [step, setStep] = useState<Step>("currency");
  const [currency, setCurrency] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [bankMessage, setBankMessage] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile) return null; // the app shell only renders this once the profile has loaded

  const chosenCurrency = currency ?? profile.currency;

  async function finish() {
    setFinishing(true);
    setError(null);
    const result = await chooseCurrency(chosenCurrency);
    // On success the shell moves to the app on its own; only a failure needs a message.
    if (result.status === "error") {
      setError(result.message);
      setFinishing(false);
    }
  }

  async function onConnectBank() {
    setBankMessage(null);
    setConnecting(true);
    const outcome = await connectBank(
      {
        link: createPlaidLinkClient(),
        fetchLinkToken: async (body) => {
          const res = await authFetch("/api/plaid/link-token", session, jsonInit("POST", body));
          const j = (await res.json()) as { link_token?: string };
          return res.ok && j.link_token ? { status: "ok", linkToken: j.link_token } : { status: "error", message: "Couldn't start the bank link." };
        },
        exchange: async (publicToken, institution) => {
          const res = await authFetch(
            "/api/plaid/exchange",
            session,
            jsonInit("POST", { public_token: publicToken, institution: institution ? { institution_id: institution.id, name: institution.name } : undefined }),
          );
          const j = (await res.json()) as { plaidItemId?: string; accounts?: { plaidAccountId: string; name: string | null }[] };
          return res.ok && j.plaidItemId && j.accounts ? { status: "ok", plaidItemId: j.plaidItemId, accounts: j.accounts } : { status: "error", message: "Couldn't finish connecting the bank." };
        },
      },
      currentPlatform(),
    );
    setConnecting(false);

    if (outcome.status === "unavailable") {
      setBankMessage("Bank connections aren't available in this build yet — you can connect one later from Settings.");
    } else if (outcome.status === "already_linked" || outcome.status === "error") {
      setBankMessage(outcome.status === "error" ? outcome.message : "You've already connected this bank.");
    } else if (outcome.status === "linked") {
      // Mapping which accounts to import can happen from Connected Banks right after onboarding finishes — keeping
      // this step to "connect, or skip" is enough for a first run, and Connected Banks already surfaces unmapped
      // accounts prominently.
      setBankMessage("Bank connected. You can choose which accounts to import from Connected Banks.");
    }
    // Connecting doesn't finish onboarding by itself — the person still confirms with Continue/Skip below.
  }

  if (step === "currency") {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title} accessibilityRole="header">
            Welcome to Budgts
          </Text>
          <Text style={styles.lead}>Which currency should Budgts use? This is set once, so every amount stays consistent.</Text>

          <View style={styles.list} accessibilityRole="radiogroup">
            {profile.supportedCurrencies.map((c) => {
              const on = c === chosenCurrency;
              return (
                <Pressable
                  key={c}
                  testID={`currency-${c}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setCurrency(c)}
                  style={[styles.option, on && styles.optionOn]}
                >
                  <Text style={[styles.optionText, on && styles.optionTextOn]}>{c}</Text>
                </Pressable>
              );
            })}
          </View>

          <PrimaryButton testID="get-started-continue" onPress={() => setStep("bank")}>
            Continue
          </PrimaryButton>
          <TextLink testID="get-started-sign-out" onPress={() => void signOut()}>
            Sign out
          </TextLink>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title} accessibilityRole="header">
          Connect your bank
        </Text>
        <Text style={styles.lead}>
          Budgts imports your transactions automatically once you connect a bank — categorized and ready to check. You can always add
          transactions by hand instead, or connect a bank later from Settings.
        </Text>

        {bankMessage ? <Text style={styles.notice}>{bankMessage}</Text> : null}
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <PrimaryButton testID="get-started-connect-bank" onPress={() => void onConnectBank()} loading={connecting} disabled={finishing}>
          Connect a bank
        </PrimaryButton>
        <PrimaryButton testID="get-started-finish" onPress={() => void finish()} loading={finishing} disabled={connecting}>
          Done — go to Budgts
        </PrimaryButton>
        <TextLink testID="get-started-back" onPress={() => setStep("currency")}>
          Back
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
  notice: { fontFamily: fonts.medium, fontSize: 14, color: colors.pos },
  error: { fontFamily: fonts.medium, fontSize: 14, color: colors.neg },
});
