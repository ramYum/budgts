import { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { parseAccounts } from "../../lib/accounts/accounts-api";
import { authFetch } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/auth-context";
import { invalidate } from "../../lib/api/invalidate";
import { loadResource, mutate, type MutationOutcome } from "../../lib/api/load";
import { jsonInit } from "../../lib/api/request";
import { useResource } from "../../lib/api/use-resource";
import { parseCategories } from "../../lib/categories/categories-api";
import { shiftDate, todayIso } from "../../lib/dates";
import { colors, fonts } from "../../lib/theme";
import { draftToPayload, emptyDraft, newRequestId, parseDraft, validateDraft, type TransactionDraft } from "../../lib/transactions/form";
import { Chip, ChipRow, ErrorBlock, Field, Loading } from "../../components/parts";
import { OutlineButton, PrimaryButton, TextLink } from "../../components/ui";

/**
 * Add / edit a manual transaction. Every rule (amount, date, account, transfer) is enforced by the server, which answers with
 * field errors shown against their fields. A create carries a request id, so tapping Save again after a dropped connection can
 * never post the transaction twice. Saving refreshes Activity, Budgets and Home through `invalidate`.
 */
export default function TransactionScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ id?: string; draft?: string }>();
  const id = typeof params.id === "string" ? params.id : null;
  const editing = id !== null;

  const accounts = useResource("accounts-form", (s) => loadResource(() => authFetch("/api/mobile/accounts", s), parseAccounts));
  const categories = useResource("categories-form", (s) => loadResource(() => authFetch("/api/mobile/categories", s), parseCategories));

  const [draft, setDraft] = useState<TransactionDraft>(
    () => parseDraft(typeof params.draft === "string" ? params.draft : undefined) ?? emptyDraft(todayIso(), null),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(newRequestId());
  const set = (patch: Partial<TransactionDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const selectable = accounts.state.status === "ready" ? accounts.state.data.accounts.filter((a) => a.selectable) : [];
  const onlyAccount = selectable.length === 1 ? selectable[0].id : null;
  // With a single usable account the common case is one tap fewer.
  useEffect(() => {
    if (!editing && onlyAccount) setDraft((d) => (d.accountId === null ? { ...d, accountId: onlyAccount } : d));
  }, [editing, onlyAccount]);

  function finish(refreshTopics = true) {
    if (refreshTopics) invalidate("transactions", "budgets", "home");
    router.back();
  }

  function handle(out: MutationOutcome) {
    setSaving(false);
    switch (out.status) {
      case "ok":
        return finish();
      case "invalid":
        // The server names `occurredAt`; the form calls that field `date`.
        setErrors({ ...out.fieldErrors, ...(out.fieldErrors.occurredAt ? { date: out.fieldErrors.occurredAt } : {}) });
        return;
      case "conflict":
        invalidate("transactions");
        return setMessage("This transaction changed while you were editing it. Go back and open it again.");
      case "missing":
        return finish(); // already gone: nothing left to edit
      default:
        return setMessage(out.status === "error" ? out.message : "Something went wrong. Please try again.");
    }
  }

  async function onSave() {
    const local = validateDraft(draft);
    setErrors(local);
    setMessage(null);
    if (Object.keys(local).length > 0) return;
    setSaving(true);
    const path = editing ? `/api/mobile/transactions/${id}` : "/api/mobile/transactions";
    const body = draftToPayload(draft, editing ? undefined : requestId.current);
    handle(await mutate(() => authFetch(path, session, jsonInit(editing ? "PATCH" : "POST", body))));
  }

  function confirmDelete() {
    Alert.alert("Delete this transaction?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          setMessage(null);
          const out = await mutate(() => authFetch(`/api/mobile/transactions/${id}`, session, { method: "DELETE" }));
          out.status === "missing" ? finish() : handle(out);
        },
      },
    ]);
  }

  if (accounts.state.status === "loading" || categories.state.status === "loading") return <Loading label="Loading the form" />;
  if (accounts.state.status === "error") {
    return <ErrorBlock title="Can't open the form" message={accounts.state.message} onRetry={() => void accounts.reload()} secondary={{ label: "Close", onPress: () => router.back() }} />;
  }
  const cats = categories.state.status === "ready" ? categories.state.data : [];

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title} accessibilityRole="header">
            {editing ? "Edit transaction" : "Add transaction"}
          </Text>

          <ChipRow>
            <Chip label="Expense" selected={draft.direction === "debit"} onPress={() => set({ direction: "debit" })} testID="dir-debit" />
            <Chip label="Income" selected={draft.direction === "credit"} onPress={() => set({ direction: "credit" })} testID="dir-credit" />
          </ChipRow>

          <Field
            label="Amount"
            testID="txn-amount"
            value={draft.amount}
            onChangeText={(amount) => set({ amount })}
            keyboardType="decimal-pad"
            placeholder="0.00"
            error={errors.amount}
          />
          <Field label="Description" testID="txn-description" value={draft.description} onChangeText={(description) => set({ description })} error={errors.description} />

          <View style={styles.block}>
            <Text style={styles.label}>Date</Text>
            <View style={styles.dateRow}>
              <Pressable testID="date-prev" accessibilityRole="button" accessibilityLabel="Previous day" hitSlop={10} onPress={() => set({ date: shiftDate(draft.date, -1) })}>
                <Text style={styles.arrow}>‹</Text>
              </Pressable>
              <Text style={styles.date} testID="txn-date">
                {draft.date}
              </Text>
              <Pressable testID="date-next" accessibilityRole="button" accessibilityLabel="Next day" hitSlop={10} onPress={() => set({ date: shiftDate(draft.date, 1) })}>
                <Text style={styles.arrow}>›</Text>
              </Pressable>
              <TextLink onPress={() => set({ date: todayIso() })}>Today</TextLink>
            </View>
            {errors.date ? <Text style={styles.error}>{errors.date}</Text> : null}
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>Account</Text>
            {selectable.length === 0 ? (
              <Text style={styles.muted}>You don&apos;t have an account to add this to yet.</Text>
            ) : (
              <ChipRow>
                {selectable.map((a) => (
                  <Chip key={a.id} label={a.name} selected={draft.accountId === a.id} onPress={() => set({ accountId: a.id })} testID={`acct-${a.id}`} />
                ))}
              </ChipRow>
            )}
            <TextLink testID="txn-add-account" onPress={() => router.push("/accounts")}>
              Add or manage accounts
            </TextLink>
            {errors.accountId ? <Text style={styles.error}>{errors.accountId}</Text> : null}
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>Category</Text>
            <ChipRow>
              <Chip label="None" selected={draft.categoryId === null} onPress={() => set({ categoryId: null })} testID="cat-none" />
              {cats.map((c) => (
                <Chip key={c.id} label={c.name} selected={draft.categoryId === c.id} onPress={() => set({ categoryId: c.id })} testID={`cat-${c.id}`} />
              ))}
            </ChipRow>
            {errors.categoryId ? <Text style={styles.error}>{errors.categoryId}</Text> : null}
          </View>

          <Field label="Note (optional)" testID="txn-note" value={draft.note} onChangeText={(note) => set({ note })} multiline error={errors.note} />

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Transfer between my accounts (doesn&apos;t count as spending)</Text>
            <Switch testID="txn-transfer" value={draft.isTransfer} onValueChange={(isTransfer) => set({ isTransfer })} />
          </View>

          {message ? (
            <Text style={styles.error} accessibilityRole="alert" testID="txn-message">
              {message}
            </Text>
          ) : null}

          <PrimaryButton testID="txn-save" onPress={() => void onSave()} loading={saving}>
            {editing ? "Save changes" : "Add transaction"}
          </PrimaryButton>
          {editing ? (
            <OutlineButton testID="txn-delete" onPress={confirmDelete} disabled={saving}>
              Delete
            </OutlineButton>
          ) : null}
          <TextLink testID="txn-cancel" onPress={() => router.back()}>
            Cancel
          </TextLink>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { fontFamily: fonts.bold, fontSize: 24, color: colors.text },
  block: { gap: 8 },
  label: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  muted: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  arrow: { fontFamily: fonts.semibold, fontSize: 26, color: colors.text },
  date: { fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  switchText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  error: { fontFamily: fonts.medium, fontSize: 13, color: colors.neg },
});
