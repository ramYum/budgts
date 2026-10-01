import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { COLOR, ROLE, type IconName } from "../../lib/brand/shared";
import { invalidate } from "../../lib/api/invalidate";
import type { AccountCommands, AccountsOverview, OverviewAccount } from "../../lib/accounts/overview-api";
import type { CommandOutcome } from "../../lib/plaid/bank-commands";
import { Button, Field, IconTile } from "../brand/controls";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { RefreshNotice } from "../home/refresh-notice";
import { Overlay } from "../kit/overlay";
import { PageHeader } from "../kit/page-header";
import { RowMenu } from "../kit/row-menu";
import { SectionHead } from "../kit/section-head";
import { Select } from "../kit/select";
import { Badge } from "../kit/tiles";

/** The web's type icons (`account-manager.tsx` TYPE_ICON). */
const TYPE_ICON: Record<string, IconName> = { checking: "wallet", credit: "credit-card", savings: "coins", cash: "wallet" };
const typeLabel = (t: string) => t[0]!.toUpperCase() + t.slice(1);

/** "Checking · 3 transactions this month" (web `AccountRow`). */
export const accountMeta = (a: Pick<OverviewAccount, "type" | "txnCount">): string =>
  `${typeLabel(a.type)} · ${a.txnCount === 0 ? "nothing this month" : `${a.txnCount} ${a.txnCount === 1 ? "transaction" : "transactions"} this month`}`;

/** A saved account moves money screens' account names and pickers; Connected banks shows the names too. */
const changed = () => invalidate("accounts", "transactions", "budgets", "home");

/**
 * Accounts (web `/accounts`: `accounts/page.tsx` + `account-manager.tsx`):
 * the title with Add, the lead line, then a card of rows per group (each
 * linked bank with its Connected / Needs attention badge, then the accounts
 * added by hand, then Archived). A row's menu edits (in a sheet) or archives
 * and restores.
 */
export function AccountsView({
  overview,
  accountTypes,
  commands,
  onBack,
  notice = null,
  onRetry,
}: {
  overview: AccountsOverview;
  accountTypes: string[];
  commands: AccountCommands;
  onBack: () => void;
  /** a reload that failed while this data was on screen (useResource's `notice`) */
  notice?: string | null;
  onRetry?: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<OverviewAccount | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(a: OverviewAccount) {
    setPending(true);
    setError(null);
    const out = await commands.setArchived(a.id, !a.isArchived);
    setPending(false);
    if (out.status === "error") setError(out.message);
    else changed();
  }

  const section = (key: string, title: string, list: OverviewAccount[], aside?: ReactNode) => (
    <View key={key} testID={`accounts-group-${key}`} style={{ gap: 12 }}>
      <SectionHead title={title} aside={aside} />
      <PixelFrame frame="px-card" style={{ padding: 8 }}>
        {list.map((a, i) => (
          <AccountRow
            key={a.id}
            a={a}
            first={i === 0}
            last={i === list.length - 1}
            pending={pending}
            onEdit={() => setEditing(a)}
            onToggle={() => void toggle(a)}
          />
        ))}
      </PixelFrame>
    </View>
  );

  return (
    <View testID="accounts-view">
        {notice && onRetry ? (
          <View style={{ marginBottom: 20 }}>
            <RefreshNotice message={notice} onRetry={onRetry} />
          </View>
        ) : null}
      <PageHeader
        title="Accounts"
        onBack={onBack}
        action={
          <Button testID="accounts-add" icon="plus" accessibilityLabel="Add account" onPress={() => setAdding(true)}>
            Add
          </Button>
        }
      />
      <View style={{ gap: 24 }}>
        <Text variant="body" color={ROLE.muted}>
          Accounts hold your transactions. Linked ones update on their own; add cash or anything else by hand.
        </Text>
        <View style={{ gap: 32 }}>
          {error ? (
            <Text testID="accounts-error" variant="small" color={ROLE.neg} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          {overview.groups.map((g) =>
            section(
              g.key,
              g.title,
              g.accounts,
              g.status === "connected" ? (
                <Badge tone="growth" icon="check">
                  Connected
                </Badge>
              ) : g.status === "attention" ? (
                <Badge tone="wash" icon="warning">
                  Needs attention
                </Badge>
              ) : undefined,
            ),
          )}
          {overview.archived.length > 0 ? section("archived", "Archived", overview.archived) : null}
        </View>
      </View>

      {adding ? (
        <Overlay title="Add account" onClose={() => setAdding(false)}>
          <AccountForm accountTypes={accountTypes} submitLabel="Add" onSubmit={(input) => commands.create(input)} onDone={() => setAdding(false)} />
        </Overlay>
      ) : null}
      {editing ? (
        <Overlay title="Edit account" onClose={() => setEditing(null)}>
          <AccountForm
            accountTypes={accountTypes}
            initial={editing}
            submitLabel="Save changes"
            onSubmit={(input) => commands.update(editing.id, input)}
            onDone={() => setEditing(null)}
          />
        </Overlay>
      ) : null}
    </View>
  );
}

function AccountRow({
  a,
  first,
  last,
  pending,
  onEdit,
  onToggle,
}: {
  a: OverviewAccount;
  first: boolean;
  last: boolean;
  pending: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const archiveLabel = a.isArchived ? "Restore" : "Archive";
  const showMask = a.mask && !a.name.includes(a.mask);
  return (
    <View
      testID={`account-row-${a.id}`}
      style={[
        { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: first ? 0 : 10, paddingBottom: last ? 0 : 10 },
        first ? null : { borderTopWidth: 1, borderTopColor: COLOR.divider },
      ]}
    >
      <IconTile name={TYPE_ICON[a.type] ?? "wallet"} />
      <View style={{ flex: 1, minWidth: 0, opacity: a.isArchived ? 0.6 : 1 }}>
        <Text testID={`account-row-${a.id}-name`} variant="listName" color={ROLE.ink} numberOfLines={1}>
          {a.name}
          {showMask ? (
            <Text variant="listName" color={ROLE.ink} style={{ fontVariant: ["tabular-nums"] }}>
              {` ••${a.mask}`}
            </Text>
          ) : null}
        </Text>
        <Text testID={`account-row-${a.id}-meta`} variant="meta" color={ROLE.muted} numberOfLines={1}>
          {accountMeta(a)}
        </Text>
      </View>
      <View style={{ marginRight: -8 }}>
        <RowMenu
          testID={`account-row-${a.id}-menu`}
          label={`More for ${a.name}`}
          items={[
            ...(!a.isArchived ? [{ label: "Edit", icon: "edit" as const, onSelect: onEdit }] : []),
            { label: archiveLabel, icon: "archive" as const, onSelect: onToggle, disabled: pending },
          ]}
        />
      </View>
    </View>
  );
}

/** Add or edit an account (web `AccountForm`): name and type, the server's own validation message on a refusal. */
function AccountForm({
  accountTypes,
  initial,
  submitLabel,
  onSubmit,
  onDone,
}: {
  accountTypes: string[];
  initial?: OverviewAccount;
  submitLabel: string;
  onSubmit: (input: { name: string; type: string }) => Promise<CommandOutcome>;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.type ?? "checking");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    const out = await onSubmit({ name, type });
    setPending(false);
    if (out.status === "error") {
      setError(out.message);
      return;
    }
    changed();
    onDone();
  }

  return (
    <View style={{ gap: 16 }} testID="account-form">
      <Field testID="account-form-name" label="Name" value={name} onChangeText={setName} maxLength={40} autoFocus returnKeyType="done" />
      <Select testID="account-form-type" label="Type" value={type} options={accountTypes.map((t) => ({ value: t, label: typeLabel(t) }))} onChange={setType} />
      {error ? (
        <Text testID="account-form-error" variant="small" color={ROLE.neg} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 12, paddingTop: 8 }}>
        <Button testID="account-form-submit" loading={pending} style={{ flex: 1 }} onPress={() => void submit()}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button testID="account-form-cancel" variant="secondary" onPress={onDone}>
          Cancel
        </Button>
      </View>
    </View>
  );
}
