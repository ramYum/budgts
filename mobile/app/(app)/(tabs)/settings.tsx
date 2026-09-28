import type { ReactNode } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth/auth-context";
import { describeFlow, describeSubscription } from "../../../lib/billing/describe";
import { useMonetization } from "../../../lib/billing/use-monetization";
import { useProfile } from "../../../lib/profile/profile-context";
import { useLegalLinks } from "../../../lib/use-legal-links";
import { colors, fonts, radii } from "../../../lib/theme";
import { OutlineButton, PrimaryButton, TextLink } from "../../../components/ui";

/**
 * Settings: account, subscription (status from the server-authoritative entitlement, paywall, Restore Purchases, Manage
 * Subscription), legal / support links, account deletion, sign-out. Required store surfaces — see
 * docs/specs/2026-09-17-mobile-app-launch-design.md). No access decision is made here.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { state: profile } = useProfile();
  const m = useMonetization();

  const email = profile.status === "ready" ? profile.profile.email : null;
  const sub = describeSubscription(m.entitlement, m.loadError !== null);
  const flow = describeFlow(m.state);
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;

  // Hidden until the web says its legal pages are live (GET /api/legal, lib/legal.ts); the About card then renders on its own.
  const links = useLegalLinks(base);
  const subscribed = m.entitlement !== null && m.entitlement.status !== "none";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title} accessibilityRole="header">
          Settings
        </Text>

        <Card label="Account">
          <Text style={styles.value} testID="settings-email">
            {email ?? "Signed in"}
          </Text>
        </Card>

        <Card label="Subscription">
          <Text style={styles.headline} testID="settings-subscription-status">
            {sub.headline}
          </Text>
          {sub.detail ? <Text style={styles.detail}>{sub.detail}</Text> : null}
          {flow ? (
            <Text style={[styles.detail, flow.tone === "error" && styles.errorText]} accessibilityRole="alert">
              {flow.text}
            </Text>
          ) : null}
          <View style={styles.actions}>
            {!m.hasPremium ? (
              <PrimaryButton testID="settings-open-paywall" onPress={() => router.push("/paywall")}>
                {m.canStartTrial ? "Start your 7-day free trial" : "View subscription options"}
              </PrimaryButton>
            ) : null}
            {subscribed ? (
              <OutlineButton testID="settings-manage-subscription" onPress={() => void m.manageSubscription()}>
                Manage subscription
              </OutlineButton>
            ) : null}
            <OutlineButton testID="settings-restore" onPress={() => void m.restorePurchases()}>
              Restore purchases
            </OutlineButton>
          </View>
        </Card>

        <Card label="Manage">
          <TextLink testID="settings-accounts" onPress={() => router.push("/accounts")}>
            Accounts
          </TextLink>
          <TextLink testID="settings-connected-banks" onPress={() => router.push("/connected-banks")}>
            Connected Banks
          </TextLink>
        </Card>

        {links.length > 0 ? (
          <Card label="About">
            <View style={styles.links}>
              {links.map((l) => (
                <TextLink key={l.page} testID={l.testID} onPress={() => void Linking.openURL(l.url)}>
                  {l.label}
                </TextLink>
              ))}
            </View>
          </Card>
        ) : null}

        <Card label="Danger zone">
          <Text style={styles.detail}>Permanently delete your Budgts account and its data.</Text>
          <OutlineButton testID="settings-delete-account" onPress={() => router.push("/delete-account")}>
            Delete account
          </OutlineButton>
        </Card>

        <OutlineButton testID="settings-sign-out" onPress={() => void signOut()}>
          Sign out
        </OutlineButton>
        <TextLink testID="settings-diagnostics" onPress={() => router.push("/diagnostics")}>
          Diagnostics
        </TextLink>
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { fontFamily: fonts.bold, fontSize: 26, color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.field,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  cardLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  headline: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  detail: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, lineHeight: 20 },
  errorText: { color: colors.neg },
  actions: { gap: 10, marginTop: 4 },
  links: { alignItems: "flex-start", gap: 2 },
});
