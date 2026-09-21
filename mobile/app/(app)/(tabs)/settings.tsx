import type { ReactNode } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth/auth-context";
import { describeFlow, describeSubscription } from "../../../lib/billing/describe";
import { useMonetization } from "../../../lib/billing/use-monetization";
import { legalUrl, type LegalPage } from "../../../lib/legal";
import { useProfile } from "../../../lib/profile/profile-context";
import { colors, fonts, radii } from "../../../lib/theme";
import { OutlineButton, PrimaryButton, TextLink } from "../../../components/ui";

const LINKS: { page: LegalPage; label: string; testID: string }[] = [
  { page: "privacy", label: "Privacy Policy", testID: "settings-privacy" },
  { page: "terms", label: "Terms of Service", testID: "settings-terms" },
  { page: "support", label: "Help & support", testID: "settings-support" },
];

/**
 * Settings: account, subscription (status from the server-authoritative entitlement, paywall, Restore Purchases, Manage
 * Subscription), legal / support links, account deletion, sign-out. Required store surfaces — see
 * docs/specs/2026-09-21-mobile-only-transition-design.md §3 (group 1). No access decision is made here.
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

  const open = (page: LegalPage) => {
    const url = legalUrl(base, page);
    if (url) void Linking.openURL(url);
  };
  const links = LINKS.filter((l) => legalUrl(base, l.page) !== null);
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
                {m.canStartTrial ? "Start your 14-day free trial" : "View subscription options"}
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

        {links.length > 0 ? (
          <Card label="About">
            <View style={styles.links}>
              {links.map((l) => (
                <TextLink key={l.page} testID={l.testID} onPress={() => open(l.page)}>
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
