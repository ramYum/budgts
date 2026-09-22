import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { requestAccountDeletion, type DeleteOutcome } from "../../lib/account/delete-account";
import { authFetch } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/auth-context";
import { colors, fonts, radii } from "../../lib/theme";
import { OutlineButton, PrimaryButton, TextLink } from "../../components/ui";

const MESSAGES: Partial<Record<DeleteOutcome["status"], string>> = {
  reauth_required: "For your security, please sign in again to confirm. Sign out, sign back in, then return here.",
  unavailable: "Account deletion is temporarily unavailable. Please try again later.",
  incomplete:
    "We couldn't finish deleting your account. It is read-only until the deletion completes — please try again.",
  failed: "We couldn't delete your account. Please try again.",
  network: "Couldn't reach Budgts. Check your connection and try again.",
  auth: "Your session has expired. Please sign in again.",
};

/**
 * In-app account deletion (Apple requires it to start in the app). The server does the work
 * (`POST /api/account/delete`, docs/specs/2026-09-19-account-deletion-design.md): no ledger history means a hard delete, a
 * charge means the account is anonymised and the financial ledger kept. Deleting the account never cancels an App Store /
 * Google Play subscription, and the screen says so before and after.
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<DeleteOutcome | null>(null);

  const onDelete = async () => {
    setBusy(true);
    setOutcome(await requestAccountDeletion(() => authFetch("/api/account/delete", session, { method: "POST" })));
    setBusy(false);
  };

  if (outcome?.status === "deleted") {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title} accessibilityRole="header">
            Your account was deleted
          </Text>
          {outcome.storeSubscriptionMayBeActive ? (
            <Text style={styles.body} testID="delete-store-warning">
              Deleting your account does not cancel your App Store or Google Play subscription. To stop being charged, cancel it
              in your store account settings.
            </Text>
          ) : null}
          {outcome.storeSubscriptionMayBeActive && outcome.manageSubscriptionUrl ? (
            <OutlineButton testID="delete-manage-subscription" onPress={() => void Linking.openURL(outcome.manageSubscriptionUrl!)}>
              How to cancel your subscription
            </OutlineButton>
          ) : null}
          <PrimaryButton testID="delete-done" onPress={() => void signOut()}>
            Done
          </PrimaryButton>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const message = outcome ? MESSAGES[outcome.status] : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title} accessibilityRole="header">
          Delete your account
        </Text>
        <Text style={styles.body}>
          This permanently deletes your Budgts account and its data. It can&apos;t be undone. If you&apos;ve made a purchase, we
          keep the financial record of it without your personal details, as the law requires.
        </Text>
        <Text style={styles.body}>
          Deleting your account does <Text style={styles.bold}>not</Text> cancel an App Store or Google Play subscription. Cancel
          that separately in your store account settings.
        </Text>

        <Pressable
          testID="delete-confirm"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed }}
          onPress={() => setConfirmed((c) => !c)}
          style={styles.confirmRow}
        >
          <View style={[styles.box, confirmed && styles.boxOn]} />
          <Text style={styles.confirmText}>I understand this can&apos;t be undone</Text>
        </Pressable>

        {message ? (
          <Text style={styles.error} accessibilityRole="alert" testID="delete-error">
            {message}
          </Text>
        ) : null}

        {outcome?.status === "reauth_required" || outcome?.status === "auth" ? (
          <PrimaryButton testID="delete-sign-out" onPress={() => void signOut()}>
            Sign out and sign in again
          </PrimaryButton>
        ) : (
          <PrimaryButton
            testID="delete-submit"
            style={styles.destructive}
            disabled={!confirmed}
            loading={busy}
            onPress={() => void onDelete()}
          >
            Delete my account
          </PrimaryButton>
        )}
        <TextLink testID="delete-cancel" onPress={() => router.back()}>
          Cancel
        </TextLink>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, gap: 16 },
  title: { fontFamily: fonts.bold, fontSize: 26, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 15, color: colors.muted, lineHeight: 22 },
  bold: { fontFamily: fonts.semibold, color: colors.text },
  confirmRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  boxOn: { backgroundColor: colors.neg, borderColor: colors.neg },
  confirmText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text, flexShrink: 1 },
  error: { fontFamily: fonts.medium, fontSize: 14, color: colors.neg },
  destructive: { backgroundColor: colors.neg, borderRadius: radii.pill },
});
