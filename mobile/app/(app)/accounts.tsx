import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { authFetch } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/auth-context";
import { parseAccounts, type MobileAccount } from "../../lib/accounts/accounts-api";
import { useVersion, invalidate } from "../../lib/api/invalidate";
import { loadResource, mutate } from "../../lib/api/load";
import { jsonInit } from "../../lib/api/request";
import { useResource } from "../../lib/api/use-resource";
import { colors, fonts, radii } from "../../lib/theme";
import { ChipRow, ErrorBlock, Field, Loading, Chip } from "../../components/parts";
import { OutlineButton, PrimaryButton, TextLink } from "../../components/ui";

/**
 * Accounts: list, add a manual account, rename / retype, and archive. A Plaid account only shows "Archive" if it is currently
 * linked (`selectable` from the server); a leftover from a disconnected bank stays visible for history but cannot be entered
 * against, matching the web behaviour exactly.
 */
export default function AccountsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const version = useVersion("accounts");
  const { state, notice, reload, refresh, refreshing } = useResource(`accounts-${version}`, (s) =>
    loadResource(() => authFetch("/api/mobile/accounts", s), parseAccounts),
  );

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Accounts
        </Text>
        <OutlineButton testID="accounts-add" onPress={() => setAdding(true)} style={styles.addBtn}>
          Add
        </OutlineButton>
      </View>

      {state.status === "loading" ? (
        <Loading label="Loading your accounts" />
      ) : state.status === "error" ? (
        <ErrorBlock title="Can't show your accounts" message={state.message} onRetry={() => void reload()} secondary={{ label: "Close", onPress: () => router.back() }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.accent} />}>
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {state.data.accounts.length === 0 ? (
            <Text style={styles.empty}>No accounts yet. Add one to start entering transactions by hand.</Text>
          ) : (
            state.data.accounts.map((a) =>
              editingId === a.id ? (
                <AccountEditor
                  key={a.id}
                  account={a}
                  accountTypes={state.data.accountTypes}
                  session={session}
                  onDone={async () => {
                    setEditingId(null);
                    invalidate("accounts");
                    await reload();
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <AccountRow key={a.id} account={a} onEdit={() => setEditingId(a.id)} />
              ),
            )
          )}
        </ScrollView>
      )}

      {adding ? (
        <AddAccountSheet
          accountTypes={state.status === "ready" ? state.data.accountTypes : []}
          session={session}
          onDone={async () => {
            setAdding(false);
            invalidate("accounts");
            await reload();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

function AccountRow({ account, onEdit }: { account: MobileAccount; onEdit: () => void }) {
  return (
    <View style={styles.row} testID={`account-${account.id}`}>
      <View style={styles.rowMain}>
        <Text style={[styles.rowName, account.archived && styles.rowMuted]}>{account.name}</Text>
        <Text style={styles.rowType}>
          {account.type}
          {account.source === "plaid" ? " · Bank" : ""}
          {account.archived ? " · Archived" : !account.selectable ? " · Bank disconnected" : ""}
        </Text>
      </View>
      <TextLink testID={`account-edit-${account.id}`} onPress={onEdit}>
        Edit
      </TextLink>
    </View>
  );
}

function AccountEditor({
  account,
  accountTypes,
  session,
  onDone,
  onCancel,
}: {
  account: MobileAccount;
  accountTypes: string[];
  session: Parameters<typeof authFetch>[1];
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(account.name);
  const [type, setType] = useState(account.type);
  const [archived, setArchived] = useState(account.archived);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    // Archiving is its own body shape on the server (`{ archived }`); anything else is name/type together.
    const archiveChanged = archived !== account.archived;
    const detailsChanged = name.trim() !== account.name || type !== account.type;
    let ok = true;
    if (archiveChanged) {
      const out = await mutate(() => authFetch(`/api/mobile/accounts/${account.id}`, session, jsonInit("PATCH", { archived })));
      ok = out.status === "ok";
      if (!ok) setError(out.status === "error" ? out.message : "Couldn't update this account.");
    }
    if (ok && detailsChanged) {
      const out = await mutate(() => authFetch(`/api/mobile/accounts/${account.id}`, session, jsonInit("PATCH", { name: name.trim(), type })));
      if (out.status === "ok") ok = true;
      else {
        ok = false;
        setError(out.status === "invalid" ? Object.values(out.fieldErrors)[0] ?? "Invalid account" : out.status === "error" ? out.message : "Couldn't update this account.");
      }
    }
    setBusy(false);
    if (ok) await onDone();
  }

  return (
    <View style={styles.editor} testID={`account-editor-${account.id}`}>
      <Field label="Name" testID="account-name" value={name} onChangeText={setName} />
      <ChipRow>
        {accountTypes.map((t) => (
          <Chip key={t} label={t} selected={type === t} onPress={() => setType(t)} testID={`account-type-${t}`} />
        ))}
      </ChipRow>
      <View style={styles.switchRow}>
        <Text style={styles.switchText}>Archived</Text>
        <Switch testID="account-archived" value={archived} onValueChange={setArchived} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.editorActions}>
        <PrimaryButton testID="account-save" onPress={() => void save()} loading={busy}>
          Save
        </PrimaryButton>
        <OutlineButton testID="account-cancel" onPress={onCancel} disabled={busy}>
          Cancel
        </OutlineButton>
      </View>
    </View>
  );
}

function AddAccountSheet({
  accountTypes,
  session,
  onDone,
  onCancel,
}: {
  accountTypes: string[];
  session: Parameters<typeof authFetch>[1];
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState(accountTypes[0] ?? "cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const out = await mutate(() => authFetch("/api/mobile/accounts", session, jsonInit("POST", { name: name.trim(), type })));
    setBusy(false);
    if (out.status === "ok") return onDone();
    setError(out.status === "invalid" ? Object.values(out.fieldErrors)[0] ?? "Invalid account" : out.status === "error" ? out.message : "Couldn't add this account.");
  }

  return (
    <View style={styles.editor} testID="account-add-form">
      <Text style={styles.editorTitle}>Add account</Text>
      <Field label="Name" testID="new-account-name" value={name} onChangeText={setName} placeholder="e.g. Wallet" />
      <ChipRow>
        {accountTypes.map((t) => (
          <Chip key={t} label={t} selected={type === t} onPress={() => setType(t)} testID={`new-account-type-${t}`} />
        ))}
      </ChipRow>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.editorActions}>
        <PrimaryButton testID="new-account-save" onPress={() => void save()} loading={busy} disabled={name.trim() === ""}>
          Add
        </PrimaryButton>
        <OutlineButton testID="new-account-cancel" onPress={onCancel} disabled={busy}>
          Cancel
        </OutlineButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8 },
  title: { fontFamily: fonts.bold, fontSize: 24, color: colors.text },
  addBtn: { minHeight: 40, paddingHorizontal: 18 },
  scroll: { padding: 20, gap: 4, paddingBottom: 40 },
  notice: { fontFamily: fonts.medium, fontSize: 13, color: colors.neg },
  empty: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, textAlign: "center", paddingVertical: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMain: { gap: 2 },
  rowName: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  rowMuted: { color: colors.muted },
  rowType: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, textTransform: "capitalize" },
  editor: {
    marginVertical: 8,
    padding: 16,
    borderRadius: radii.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 12,
  },
  editorTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  editorActions: { flexDirection: "row", gap: 10 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchText: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  error: { fontFamily: fonts.medium, fontSize: 13, color: colors.neg },
});
