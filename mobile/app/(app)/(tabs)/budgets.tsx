import { useCallback, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authFetch } from "../../../lib/auth/api";
import { useAuth } from "../../../lib/auth/auth-context";
import { useVersion } from "../../../lib/api/invalidate";
import { loadResource, mutate } from "../../../lib/api/load";
import { jsonInit } from "../../../lib/api/request";
import { useResource } from "../../../lib/api/use-resource";
import { currentMonth, shiftMonth } from "../../../lib/dates";
import { formatMoney } from "../../../lib/home/format";
import { parseBudgets, type MobileBudgetCategory } from "../../../lib/budgets/budgets-api";
import { useProfile } from "../../../lib/profile/profile-context";
import { colors, fonts, radii } from "../../../lib/theme";
import { ErrorBlock, Field, Loading, MonthNav } from "../../../components/parts";
import { OutlineButton, PrimaryButton, TextLink } from "../../../components/ui";

const STATE_COLOR: Record<MobileBudgetCategory["state"], string> = { under: colors.pos, near: colors.fillNear, over: colors.neg };

/**
 * Budgets: this month's budget vs actual per expense category, from the same authoritative dashboard math as Home and
 * Activity's needs-category flag. Tapping a row opens an inline amount editor (empty or 0 clears the budget); "Copy last
 * month" fills every category at once and says plainly when there is nothing to copy.
 */
export default function BudgetsScreen() {
  const { session } = useAuth();
  const { state: profile } = useProfile();
  const [month, setMonth] = useState(currentMonth());
  const version = useVersion("budgets");
  const key = `${month}|${version}`;

  const { state, notice, reload, refresh, refreshing } = useResource(key, (s) =>
    loadResource(() => authFetch(`/api/mobile/budgets?month=${month}`, s), parseBudgets),
  );
  const currency = profile.status === "ready" ? profile.profile.currency : state.status === "ready" ? state.data.currency : "USD";

  const [editing, setEditing] = useState<MobileBudgetCategory | null>(null);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  const openEditor = (c: MobileBudgetCategory) => {
    setEditing(c);
    setAmount(c.budget > 0 ? (c.budget / 100).toFixed(2) : "");
    setError(null);
  };

  const saveAmount = useCallback(async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    const out = await mutate(() =>
      authFetch("/api/mobile/budgets", session, jsonInit("PUT", { categoryId: editing.id, month, amount })),
    );
    setSaving(false);
    if (out.status === "ok") {
      setEditing(null);
      await reload();
    } else if (out.status === "invalid") {
      setError(Object.values(out.fieldErrors)[0] ?? "Enter a valid amount");
    } else {
      setError(out.status === "error" ? out.message : "Something went wrong. Please try again.");
    }
  }, [editing, month, amount, session, reload]);

  const copyLastMonth = useCallback(async () => {
    setCopying(true);
    const out = await mutate(() => authFetch("/api/mobile/budgets/copy", session, jsonInit("POST", { month })));
    setCopying(false);
    if (out.status === "ok") return reload();
    if (out.status === "nothing_to_copy") return Alert.alert("Nothing to copy", "Last month had no budgets set.");
    Alert.alert("Couldn't copy last month", out.status === "error" ? out.message : "Something went wrong. Please try again.");
  }, [month, session, reload]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Budgets
        </Text>
      </View>
      <View style={styles.monthWrap}>
        <MonthNav month={month} onPrev={() => setMonth((m) => shiftMonth(m, -1))} onNext={() => setMonth((m) => shiftMonth(m, 1))} />
      </View>

      {state.status === "loading" ? (
        <Loading label="Loading your budgets" />
      ) : state.status === "error" ? (
        <ErrorBlock title="Can't show your budgets" message={state.message} onRetry={() => void reload()} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.accent} />}
        >
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <View style={styles.summary}>
            <Text style={styles.summaryAmount}>{formatMoney(state.data.leftToSpend, currency)}</Text>
            <Text style={styles.summaryLabel}>
              left of {formatMoney(state.data.budgeted, currency)} budgeted · {formatMoney(state.data.spent, currency)} spent
            </Text>
          </View>

          <OutlineButton testID="budgets-copy-last" onPress={() => void copyLastMonth()} loading={copying}>
            Copy last month&apos;s budgets
          </OutlineButton>

          {state.data.categories.length === 0 ? (
            <Text style={styles.empty}>No categories with spending or a budget yet this month.</Text>
          ) : (
            state.data.categories.map((c) => (
              <View key={c.id} style={styles.row}>
                <View style={styles.rowMain}>
                  <View style={styles.rowHeader}>
                    <View style={[styles.dot, { backgroundColor: c.color }]} />
                    <Text style={styles.rowName}>{c.name}</Text>
                  </View>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${Math.min(c.pctUsed, 1) * 100}%`, backgroundColor: STATE_COLOR[c.state] }]} />
                  </View>
                  <Text style={styles.rowAmounts}>
                    {formatMoney(c.actual, currency)} of {c.budget > 0 ? formatMoney(c.budget, currency) : "no budget set"}
                  </Text>
                </View>
                <TextLink testID={`budget-edit-${c.id}`} onPress={() => openEditor(c)}>
                  Edit
                </TextLink>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {editing ? (
        <View style={styles.editor}>
          <Text style={styles.editorTitle}>{editing.name}</Text>
          <Field
            label={`Monthly budget (${currency})`}
            testID="budget-amount"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            error={error ?? undefined}
          />
          <View style={styles.editorActions}>
            <PrimaryButton testID="budget-save" onPress={() => void saveAmount()} loading={saving}>
              Save
            </PrimaryButton>
            <OutlineButton testID="budget-cancel" onPress={() => setEditing(null)} disabled={saving}>
              Cancel
            </OutlineButton>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 8 },
  title: { fontFamily: fonts.bold, fontSize: 26, color: colors.text },
  monthWrap: { paddingHorizontal: 20 },
  scroll: { padding: 20, gap: 14, paddingBottom: 40 },
  notice: { fontFamily: fonts.medium, fontSize: 13, color: colors.neg },
  summary: { alignItems: "center", gap: 4, paddingVertical: 8 },
  summaryAmount: { fontFamily: fonts.bold, fontSize: 30, color: colors.text },
  summaryLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: "center" },
  empty: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, textAlign: "center", paddingVertical: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  rowMain: { flex: 1, gap: 6 },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowName: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  rowAmounts: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  editor: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: 20,
    gap: 12,
  },
  editorTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  editorActions: { flexDirection: "row", gap: 10 },
});
