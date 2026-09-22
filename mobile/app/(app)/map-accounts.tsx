import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { parseAccounts } from "../../lib/accounts/accounts-api";
import { authFetch } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/auth-context";
import { invalidate } from "../../lib/api/invalidate";
import { loadResource, mutate } from "../../lib/api/load";
import { jsonInit } from "../../lib/api/request";
import { useResource } from "../../lib/api/use-resource";
import { parseBanks } from "../../lib/plaid/banks-api";
import { buildMapEntries, emptyMapRows, type MapRow } from "../../lib/plaid/mapping";
import { colors, fonts } from "../../lib/theme";
import { Chip, ChipRow, ErrorBlock, Field, Loading } from "../../components/parts";
import { PrimaryButton, TextLink } from "../../components/ui";

/**
 * "Choose which accounts to import" — one row per newly linked Plaid account: create a new Budgts account (default),
 * point at an existing one, or skip it. Reached after a fresh connect, or from Connected Banks for an item with
 * accounts still `unmapped`. Saves via `POST /api/mobile/plaid/accounts/map`, which also runs the first sync.
 */
export default function MapAccountsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { plaidItemId } = useLocalSearchParams<{ plaidItemId: string }>();

  const banks = useResource("banks-for-mapping", (s) => loadResource(() => authFetch("/api/mobile/plaid/banks", s), parseBanks));
  const accounts = useResource("accounts-for-mapping", (s) => loadResource(() => authFetch("/api/mobile/accounts", s), parseAccounts));

  const bank = banks.state.status === "ready" ? banks.state.data.find((b) => b.id === plaidItemId) : undefined;
  const unmapped = bank?.unmappedAccounts ?? [];
  const existingAccounts = accounts.state.status === "ready" ? accounts.state.data.accounts : [];

  const [rows, setRows] = useState<MapRow[] | null>(null);
  useEffect(() => {
    if (rows === null && banks.state.status === "ready" && bank) {
      setRows(emptyMapRows(unmapped, existingAccounts[0]?.id ?? ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banks.state.status, bank]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<MapRow>) => setRows((prev) => (prev ? prev.map((r, j) => (j === i ? { ...r, ...patch } : r)) : prev));

  async function onSave() {
    if (!rows || !plaidItemId) return;
    setSaving(true);
    setError(null);
    const entries = buildMapEntries(unmapped, rows);
    const out = await mutate(() => authFetch("/api/mobile/plaid/accounts/map", session, jsonInit("POST", { plaidItemId, entries })));
    setSaving(false);
    if (out.status === "ok") {
      invalidate("accounts", "transactions", "budgets", "home");
      router.back();
      return;
    }
    setError(out.status === "invalid" ? Object.values(out.fieldErrors)[0] ?? "Check the account choices and try again." : out.status === "error" ? out.message : "Something went wrong. Please try again.");
  }

  if (banks.state.status === "loading" || accounts.state.status === "loading") return <Loading label="Loading accounts" />;
  if (banks.state.status === "error") return <ErrorBlock title="Can't load your banks" message={banks.state.message} onRetry={() => void banks.reload()} />;
  if (!bank || unmapped.length === 0 || !rows) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.scroll}>
          <Text style={styles.title}>Nothing to map</Text>
          <Text style={styles.lead}>Every account from this bank has already been imported or skipped.</Text>
          <TextLink onPress={() => router.back()}>Back</TextLink>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title} accessibilityRole="header">
          Choose which accounts to import
        </Text>
        <Text style={styles.lead}>Each account can become a new Budgts account, feed one you already have, or be left out.</Text>

        {unmapped.map((a, i) => {
          const r = rows[i];
          return (
            <View key={a.plaidAccountId} style={styles.card} testID={`map-row-${a.plaidAccountId}`}>
              <Text style={styles.accountLabel}>
                {a.name ?? a.officialName ?? "Account"}
                {a.mask ? ` ••${a.mask}` : ""}
              </Text>

              <ChipRow>
                <Chip label="New account" selected={r.mode === "new"} onPress={() => update(i, { mode: "new" })} testID={`mode-new-${i}`} />
                <Chip label="Existing account" selected={r.mode === "existing"} onPress={() => update(i, { mode: "existing" })} testID={`mode-existing-${i}`} />
                <Chip label="Don't import" selected={r.mode === "ignore"} onPress={() => update(i, { mode: "ignore" })} testID={`mode-ignore-${i}`} />
              </ChipRow>

              {r.mode === "new" ? <Field label="Name" testID={`map-name-${i}`} value={r.name} onChangeText={(name) => update(i, { name })} /> : null}
              {r.mode === "existing" && existingAccounts.length > 0 ? (
                <ChipRow>
                  {existingAccounts.map((ex) => (
                    <Chip key={ex.id} label={ex.name} selected={r.existingAccountId === ex.id} onPress={() => update(i, { existingAccountId: ex.id })} testID={`map-existing-${i}-${ex.id}`} />
                  ))}
                </ChipRow>
              ) : null}
            </View>
          );
        })}

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <PrimaryButton testID="map-save" onPress={() => void onSave()} loading={saving}>
          Import transactions
        </PrimaryButton>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  lead: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, lineHeight: 20 },
  card: { gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  accountLabel: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  error: { fontFamily: fonts.medium, fontSize: 13, color: colors.neg },
});
