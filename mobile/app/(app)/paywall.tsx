import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { describeFlow } from "../../lib/billing/describe";
import { useMonetization } from "../../lib/billing/use-monetization";
import type { Offer } from "../../lib/billing/purchases";
import { colors, fonts, radii } from "../../lib/theme";
import { OutlineButton, PrimaryButton, TextLink } from "../../components/ui";

const PERIOD: Record<string, string> = { monthly: "month", annual: "year" };

function priceLine(o: Offer): string {
  const period = o.plan ? PERIOD[o.plan] : null;
  return `${o.priceString}${period ? ` per ${period}` : ""}`;
}

/**
 * Paywall / trial screen. Everything shown comes from the store (price, trial length) or the server (entitlement); a
 * purchase only counts once the server confirms it (`useMonetization`). Budgts does not send its own trial-end
 * reminder (owner decision 2026-09-22) — only the store's own renewal disclosure below applies. That wording is the
 * standard store disclosure and should get a final wording review before store submission.
 */
export default function PaywallScreen() {
  const router = useRouter();
  const m = useMonetization();
  const flow = describeFlow(m.state);
  const busy = m.state.kind === "purchasing" || m.state.kind === "confirming";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title} accessibilityRole="header">
          {m.canStartTrial ? "Start your 7-day free trial" : "Budgts subscription"}
        </Text>
        <Text style={styles.lead}>{m.canStartTrial ? "Try Budgts free for 7 days." : "Subscribe to keep using Budgts."}</Text>

        {m.hasPremium ? (
          <View style={styles.card}>
            <Text style={styles.headline}>You're all set</Text>
            <Text style={styles.detail}>Your subscription is active.</Text>
            <PrimaryButton testID="paywall-done" onPress={() => router.back()}>
              Done
            </PrimaryButton>
          </View>
        ) : (
          <View style={styles.offers}>
            {m.offers.length === 0 ? (
              <Text style={styles.detail} testID="paywall-unavailable">
                Subscriptions aren&apos;t available right now. Please try again later.
              </Text>
            ) : (
              m.offers.map((o) => (
                <PrimaryButton
                  key={o.productId}
                  testID={`paywall-offer-${o.plan ?? o.productId}`}
                  loading={busy}
                  onPress={() => void m.startFreeTrial(o)}
                >
                  {o.trialDays !== null ? `Start free trial · then ${priceLine(o)}` : `Subscribe · ${priceLine(o)}`}
                </PrimaryButton>
              ))
            )}
            {m.state.kind === "not_confirmed" ? (
              <OutlineButton testID="paywall-check-again" onPress={() => void m.recheck()}>
                Check again
              </OutlineButton>
            ) : null}
            <OutlineButton testID="paywall-restore" onPress={() => void m.restorePurchases()}>
              Restore purchases
            </OutlineButton>
          </View>
        )}

        {flow ? (
          <Text style={[styles.detail, flow.tone === "error" && styles.error]} accessibilityRole="alert">
            {flow.text}
          </Text>
        ) : null}

        <Text style={styles.fine}>
          Payment is charged to your App Store or Google Play account when the free trial ends. The subscription renews
          automatically unless you cancel at least 24 hours before the end of the current period. You can manage or cancel it
          any time in your store account settings.
        </Text>

        <TextLink testID="paywall-close" onPress={() => router.back()}>
          Not now
        </TextLink>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, gap: 16 },
  title: { fontFamily: fonts.bold, fontSize: 26, color: colors.text },
  lead: { fontFamily: fonts.regular, fontSize: 15, color: colors.muted, lineHeight: 22 },
  offers: { gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.field,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  headline: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  detail: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, lineHeight: 20 },
  error: { color: colors.neg },
  fine: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, lineHeight: 18 },
});
