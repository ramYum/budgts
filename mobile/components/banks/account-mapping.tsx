import { useState } from "react";
import { TextInput, View } from "react-native";
import { COLOR, PLACEHOLDER, ROLE } from "../../lib/brand/shared";
import { textStyle } from "../../lib/brand/type";
import { invalidate } from "../../lib/api/invalidate";
import { useAuth } from "../../lib/auth/auth-context";
import type { UnmappedAccount } from "../../lib/plaid/banks-api";
import { bankCommands, type CommandOutcome } from "../../lib/plaid/bank-commands";
import { accountLabel, buildMapEntries, emptyMapRows, type MapEntry, type MapMode, type MapRow, type MappingChoices } from "../../lib/plaid/mapping";
import { Button } from "../brand/controls";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { Sheet, SelectField } from "./interim-sheet";
import { SMALL } from "./type";

/** The mapping sheet's title, the web's (`connect-bank.tsx`, `connected-banks.tsx`). */
export const MAPPING_TITLE = "Choose which accounts to import";

const typeLabel = (t: string) => t[0]!.toUpperCase() + t.slice(1);

/**
 * "Choose which accounts to import": the web's `AccountMapping`
 * (src/components/plaid/account-mapping.tsx). One card per newly linked Plaid
 * account: import it as a new Budgts account (the default, named and typed
 * from Plaid's guess), feed an existing one, or leave it out. Saving runs the
 * server's own mapping and first sync; a sync that didn't finish shows its
 * warning with Done, as the web does.
 */
export function AccountMapping({
  plaidAccounts,
  choices,
  onSave,
  onDone,
}: {
  plaidAccounts: UnmappedAccount[];
  choices: MappingChoices;
  onSave: (entries: MapEntry[]) => Promise<CommandOutcome>;
  onDone: () => void;
}) {
  const { budgtsAccounts, accountTypes } = choices;
  const [rows, setRows] = useState<MapRow[]>(() => emptyMapRows(plaidAccounts, budgtsAccounts[0]?.id ?? ""));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const update = (i: number, patch: Partial<MapRow>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save() {
    setPending(true);
    setError(null);
    const out = await onSave(buildMapEntries(plaidAccounts, rows));
    setPending(false);
    if (out.status === "error") setError(out.message);
    else if (out.warning) setWarning(out.warning);
    else onDone();
  }

  if (warning) {
    return (
      <View style={{ gap: 12 }} testID="account-mapping-warning">
        <Text variant="body" color={ROLE.muted} style={SMALL}>
          {warning}
        </Text>
        <Button testID="account-mapping-done" onPress={onDone}>
          Done
        </Button>
      </View>
    );
  }

  const modes: { value: MapMode; label: string; disabled?: boolean }[] = [
    { value: "new", label: "A new Budgts account" },
    { value: "existing", label: "An existing account", disabled: budgtsAccounts.length === 0 },
    { value: "ignore", label: "Don't import this one" },
  ];

  return (
    <View style={{ gap: 16 }} testID="account-mapping">
      <Text variant="body" color={ROLE.muted} style={SMALL}>
        Each account can become a new Budgts account, feed one you already have, or be left out.
      </Text>

      <View style={{ gap: 12 }}>
        {plaidAccounts.map((a, i) => {
          const r = rows[i]!;
          return (
            <PixelFrame key={a.plaidAccountId} frame="px-card" testID={`account-mapping-row-${i}`} style={{ padding: 12, gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <Text variant="listName" color={ROLE.ink} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {accountLabel(a)}
                </Text>
                <Text variant="body" color={ROLE.muted} style={[SMALL, { flexShrink: 0 }]}>
                  {a.subtype ?? a.type ?? "account"}
                </Text>
              </View>

              <SelectField
                label="Import as"
                testID={`account-mapping-mode-${i}`}
                value={r.mode}
                options={modes}
                onChange={(mode) => update(i, { mode })}
              />

              {r.mode === "new" ? (
                <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                  <PixelFrame frame="px-field" style={{ flex: 1, minWidth: 0, height: 44 }}>
                    <TextInput
                      testID={`account-mapping-name-${i}`}
                      value={r.name}
                      onChangeText={(name) => update(i, { name })}
                      maxLength={40}
                      accessibilityLabel="New account name"
                      placeholderTextColor={PLACEHOLDER}
                      cursorColor={ROLE.ink}
                      selectionColor={COLOR.signal}
                      style={[
                        textStyle("input"),
                        { flex: 1, paddingHorizontal: 8, paddingVertical: 4, color: ROLE.ink, textAlignVertical: "center", includeFontPadding: false },
                      ]}
                    />
                  </PixelFrame>
                  <SelectField
                    testID={`account-mapping-type-${i}`}
                    accessibilityLabel="New account type"
                    style={{ width: 112 }}
                    value={r.type}
                    options={accountTypes.map((t) => ({ value: t, label: typeLabel(t) }))}
                    onChange={(type) => update(i, { type })}
                  />
                </View>
              ) : null}

              {r.mode === "existing" ? (
                <SelectField
                  testID={`account-mapping-existing-${i}`}
                  accessibilityLabel="Existing account"
                  value={r.existingAccountId}
                  options={budgtsAccounts.map((b) => ({ value: b.id, label: b.name }))}
                  onChange={(existingAccountId) => update(i, { existingAccountId })}
                />
              ) : null}
            </PixelFrame>
          );
        })}
      </View>

      {error ? (
        <Text testID="account-mapping-error" variant="body" color={ROLE.neg} style={SMALL} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Button testID="account-mapping-save" onPress={() => void save()} loading={pending}>
        {pending ? "Saving…" : "Import transactions"}
      </Button>
    </View>
  );
}

export type AccountMappingSheetProps = {
  /** the bank's `plaid_items.id`: `ConnectedBank.id`, or the exchange reply's `plaidItemId` */
  plaidItemId: string;
  /** the accounts to map: `ConnectedBank.unmappedAccounts`, or the exchange reply's `accounts` */
  plaidAccounts: UnmappedAccount[];
  /** the existing accounts and account types on offer (`mappingChoices()` over `GET /api/mobile/accounts`) */
  choices: MappingChoices;
  /** saved (after its Done, when the first sync left a warning); the app's data is already invalidated */
  onDone: () => void;
  /** dismissed without saving: the bank stays connected, its accounts wait in Connected banks */
  onClose: () => void;
};

/**
 * The mapping sheet (web: `AccountMapping` in an `Overlay` titled "Choose which
 * accounts to import"), used by Connect a bank and by a bank card's "Choose
 * accounts to import". Mount it to open it; it saves through
 * `POST /api/mobile/plaid/accounts/map`.
 */
export function AccountMappingSheet({ plaidItemId, plaidAccounts, choices, onDone, onClose }: AccountMappingSheetProps) {
  const { session } = useAuth();
  const onSave = async (entries: MapEntry[]) => {
    const out = await bankCommands(session).mapAccounts(plaidItemId, entries);
    // saved: new accounts, and the first sync's transactions, reach every screen
    if (out.status === "ok") invalidate("accounts", "transactions", "budgets", "home");
    return out;
  };
  return (
    <Sheet title={MAPPING_TITLE} onClose={onClose}>
      <AccountMapping plaidAccounts={plaidAccounts} choices={choices} onSave={onSave} onDone={onDone} />
    </Sheet>
  );
}
