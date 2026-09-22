import { useCallback, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { authFetch } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/auth-context";
import { invalidate, useVersion } from "../../lib/api/invalidate";
import { loadResource } from "../../lib/api/load";
import { jsonInit } from "../../lib/api/request";
import { useResource } from "../../lib/api/use-resource";
import { parseBanks, statusNeedsAttention, type BankAccount, type BankStatus, type ConnectedBank } from "../../lib/plaid/banks-api";
import { connectBank, reconnectBank } from "../../lib/plaid/link-flow";
import { createPlaidLinkClient, currentPlatform } from "../../lib/plaid/plaid-link-native";
import { colors, fonts, radii } from "../../lib/theme";
import { ErrorBlock, Loading, Notice } from "../../components/parts";
import { OutlineButton, PrimaryButton, TextLink } from "../../components/ui";

const STATUS_LABEL: Record<BankStatus, string> = {
  active: "Connected",
  login_required: "Needs your login again",
  pending_expiration: "Access expiring soon",
  revoked: "Access revoked",
  error: "Connection error",
};

/**
 * Connected Banks: status per institution, reconnect (Plaid Link in update mode), disconnect, the calculation-exclusion
 * toggle, and unmapped accounts awaiting a mapping choice. "Connect a bank" starts a fresh Link session. No silent
 * failure states: a non-active status and any pending sign-check are always shown, never hidden.
 */
export default function ConnectedBanksScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const version = useVersion("accounts");
  const { state, notice, reload, refresh, refreshing } = useResource(`banks-${version}`, (s) =>
    loadResource(() => authFetch("/api/mobile/plaid/banks", s), parseBanks),
  );

  const [connecting, setConnecting] = useState(false);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onConnect = useCallback(async () => {
    setMessage(null);
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
          const j = (await res.json()) as { plaidItemId?: string; accounts?: { plaidAccountId: string; name: string | null }[]; error?: string; itemId?: string };
          if (res.status === 409 && j.error === "already-linked") return { status: "already_linked", itemId: j.itemId ?? "" };
          if (res.ok && j.plaidItemId && j.accounts) return { status: "ok", plaidItemId: j.plaidItemId, accounts: j.accounts };
          return { status: "error", message: "Couldn't finish connecting the bank. Try again." };
        },
      },
      currentPlatform(),
    );
    setConnecting(false);

    if (outcome.status === "unavailable") {
      setMessage("Bank connections aren't available in this build yet.");
    } else if (outcome.status === "already_linked") {
      setMessage("You've already connected this bank. Reconnect it below if it needs attention.");
    } else if (outcome.status === "error") {
      setMessage(outcome.message);
    } else if (outcome.status === "linked") {
      invalidate("accounts");
      if (outcome.accounts.length > 0) {
        router.push({ pathname: "/map-accounts", params: { plaidItemId: outcome.plaidItemId } });
      } else {
        await reload();
      }
    }
  }, [session, router, reload]);

  const onReconnect = useCallback(
    async (bank: ConnectedBank) => {
      setMessage(null);
      setReconnectingId(bank.id);
      const outcome = await reconnectBank(
        {
          link: createPlaidLinkClient(),
          fetchLinkToken: async (body) => {
            const res = await authFetch("/api/plaid/link-token", session, jsonInit("POST", body));
            const j = (await res.json()) as { link_token?: string };
            return res.ok && j.link_token ? { status: "ok", linkToken: j.link_token } : { status: "error", message: "Couldn't start the reconnect." };
          },
          sync: async (itemId) => {
            const res = await authFetch("/api/mobile/plaid/sync", session, jsonInit("POST", { itemId }));
            return res.ok ? { status: "ok" } : { status: "error", message: "Reconnected, but the sync didn't finish. It'll retry shortly." };
          },
        },
        bank.itemId,
        currentPlatform(),
      );
      setReconnectingId(null);
      if (outcome.status === "error") setMessage(outcome.message);
      if (outcome.status === "ok" || outcome.status === "error") {
        invalidate("accounts");
        await reload();
      }
    },
    [session, reload],
  );

  const onDisconnect = useCallback(
    (bank: ConnectedBank) => {
      Alert.alert(`Disconnect ${bank.institutionName ?? "this bank"}?`, "Your imported transactions are kept. You can reconnect any time.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setDisconnectingId(bank.id);
            const res = await authFetch("/api/plaid/item", session, jsonInit("DELETE", { itemId: bank.itemId }));
            setDisconnectingId(null);
            if (!res.ok) {
              setMessage("Couldn't disconnect this bank. Try again.");
              return;
            }
            invalidate("accounts");
            await reload();
          },
        },
      ]);
    },
    [session, reload],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Connected Banks
        </Text>
      </View>

      {state.status === "loading" ? (
        <Loading label="Loading your connected banks" />
      ) : state.status === "error" ? (
        <ErrorBlock title="Can't show your banks" message={state.message} onRetry={() => void reload()} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.accent} />}>
          {notice ? <Notice text={notice} /> : null}
          {message ? (
            <Text style={styles.error} accessibilityRole="alert" testID="connected-banks-message">
              {message}
            </Text>
          ) : null}

          {state.data.length === 0 ? (
            <Text style={styles.empty}>Connect a bank and Budgts imports its transactions for you.</Text>
          ) : (
            state.data.map((bank) => (
              <View key={bank.id} style={styles.card} testID={`bank-${bank.id}`}>
                <View style={styles.cardHeader}>
                  <Text style={styles.bankName}>{bank.institutionName ?? "Bank"}</Text>
                  <Text style={[styles.status, statusNeedsAttention(bank.status) && styles.statusAttention]}>{STATUS_LABEL[bank.status]}</Text>
                </View>

                {bank.accounts.map((a) => (
                  <AccountRow key={a.rowId} account={a} session={session} onChanged={reload} />
                ))}

                {bank.unmappedAccounts.length > 0 ? (
                  <TextLink testID={`map-${bank.id}`} onPress={() => router.push({ pathname: "/map-accounts", params: { plaidItemId: bank.id } })}>
                    Choose which accounts to import ({bank.unmappedAccounts.length})
                  </TextLink>
                ) : null}

                <View style={styles.cardActions}>
                  {statusNeedsAttention(bank.status) ? (
                    <OutlineButton testID={`reconnect-${bank.id}`} onPress={() => void onReconnect(bank)} loading={reconnectingId === bank.id}>
                      Reconnect
                    </OutlineButton>
                  ) : null}
                  <OutlineButton testID={`disconnect-${bank.id}`} onPress={() => onDisconnect(bank)} loading={disconnectingId === bank.id}>
                    Disconnect
                  </OutlineButton>
                </View>
              </View>
            ))
          )}

          <PrimaryButton testID="connect-bank" onPress={() => void onConnect()} loading={connecting}>
            {state.data.length === 0 ? "Connect a bank" : "Connect another bank"}
          </PrimaryButton>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function AccountRow({ account, session, onChanged }: { account: BankAccount; session: Parameters<typeof authFetch>[1]; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  const toggleExclude = async () => {
    setBusy(true);
    const res = await authFetch(`/api/mobile/plaid/accounts/${account.rowId}/exclude`, session, jsonInit("PATCH", { excluded: !account.excludedFromCalculations }));
    setBusy(false);
    if (res.status === 409) {
      Alert.alert("Can't exclude this account", "Only an account currently flagged for review can be excluded from totals.");
      return;
    }
    if (res.ok) {
      invalidate("accounts");
      await onChanged();
    }
  };

  return (
    <View style={styles.accountRow} testID={`account-${account.rowId}`}>
      <View style={styles.accountMain}>
        <Text style={styles.accountName}>{account.mappedAccountName ?? account.name ?? "Account"}</Text>
        {account.needsReview ? (
          <Text style={styles.needsReview}>{account.reviewReason ?? "We're checking this account's transaction format"}</Text>
        ) : null}
        {account.pendingSignCheckCount > 0 ? <Text style={styles.needsReview}>Checking {account.pendingSignCheckCount} transaction(s)…</Text> : null}
      </View>
      {account.needsReview || account.excludedFromCalculations ? (
        <TextLink testID={`exclude-${account.rowId}`} onPress={() => void toggleExclude()}>
          {busy ? "…" : account.excludedFromCalculations ? "Include again" : "Exclude"}
        </TextLink>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 8 },
  title: { fontFamily: fonts.bold, fontSize: 24, color: colors.text },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },
  empty: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, textAlign: "center", paddingVertical: 12 },
  error: { fontFamily: fonts.medium, fontSize: 13, color: colors.neg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.field,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bankName: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  status: { fontFamily: fonts.medium, fontSize: 12, color: colors.pos },
  statusAttention: { color: colors.neg },
  accountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 6 },
  accountMain: { flex: 1, gap: 2 },
  accountName: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  needsReview: { fontFamily: fonts.medium, fontSize: 12, color: colors.accent },
  cardActions: { flexDirection: "row", gap: 10, marginTop: 4 },
});
