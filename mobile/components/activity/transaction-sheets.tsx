import { useState, type ReactNode } from "react";
import { Alert, View } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { formatFullDate } from "../../lib/shared";
import type { AccountsData } from "../../lib/accounts/accounts-api";
import type { LoadState, MutationOutcome } from "../../lib/api/load";
import { ALREADY_SAVED } from "../../lib/api/request-id";
import type { MobileCategory } from "../../lib/categories/categories-api";
import { rowAmount, rowTitle } from "../../lib/transactions/activity-view";
import type { MobileTransaction } from "../../lib/transactions/transactions-api";
import type { TransactionCommands } from "../../lib/transactions/use-transaction-commands";
import { Button } from "../brand/controls";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { Skeleton } from "../feedback/skeleton";
import { Overlay } from "../kit/overlay";
import { CategoryIcon } from "../kit/tiles";
import { WarnLine } from "./limited-history-banner";
import { FieldError, TransactionForm, type Saved } from "./transaction-form";


/** "Tuesday, September 29, 2026" (the web's own formatter). */
export const fullDateLabel = (iso: string, locale?: string): string => formatFullDate(iso, locale);

/** The web's `confirm("Delete this transaction?")`, as the platform's dialog. */
export function confirmDelete(onYes: () => void) {
  Alert.alert("Delete this transaction?", undefined, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onYes },
  ]);
}

function Detail({ label, children, first, last }: { label: string; children: ReactNode; first: boolean; last: boolean }) {
  return (
    <View
      style={[
        { flexDirection: "row", justifyContent: "space-between", gap: 16, paddingTop: first ? 0 : 12, paddingBottom: last ? 0 : 12 },
        first ? null : { borderTopWidth: 1, borderTopColor: COLOR.divider },
      ]}
    >
      <Text variant="body" color={ROLE.muted}>
        {label}
      </Text>
      <View style={{ flexShrink: 1, alignItems: "flex-end" }}>{children}</View>
    </View>
  );
}

/**
 * "Transaction" (the web list's detail sheet): the row's icon, name and note, then Date, Category, Account and Amount, and
 * two actions: Edit, and a one-tap Mark as transfer / Remove transfer that re-sends the row with only that flag flipped.
 */
export function TransactionDetailSheet({
  transaction,
  currency,
  onClose,
  onEdit,
  onToggleTransfer,
  alreadySaved = false,
}: {
  transaction: MobileTransaction;
  currency: string;
  /** opened for a create the server answered replayed: say that the later changes weren't applied */
  alreadySaved?: boolean;
  onClose: () => void;
  onEdit: (t: MobileTransaction) => void;
  onToggleTransfer: (t: MobileTransaction) => Promise<MutationOutcome>;
}) {
  const [t, setT] = useState(transaction);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    setPending(true);
    const out = await onToggleTransfer(t);
    setPending(false);
    if (out.status === "ok") setT({ ...t, isTransfer: !t.isTransfer, uncategorized: t.isTransfer && !t.category });
    else if (out.status === "missing") onClose();
    else setError(out.status === "error" ? out.message : "Could not update this transaction.");
  }

  const rows: [string, ReactNode][] = [
    ["Date", <Text key="d" variant="body" color={ROLE.ink} style={{ textAlign: "right" }}>{fullDateLabel(t.occurredAt)}</Text>],
    ["Category", <Text key="c" variant="body" color={ROLE.ink} style={{ textAlign: "right" }}>{t.isTransfer ? "Transfer" : (t.category?.name ?? "Needs a category")}</Text>],
    ["Account", <Text key="a" variant="body" color={ROLE.ink} style={{ textAlign: "right" }}>{t.account.name}</Text>],
    [
      "Amount",
      <Text key="m" testID="txn-detail-amount" variant="bodyStrong" color={t.direction === "credit" ? ROLE.pos : ROLE.ink} style={{ fontVariant: ["tabular-nums"] }}>
        {rowAmount(t, currency)}
      </Text>,
    ],
  ];

  return (
    <Overlay title="Transaction" onClose={onClose}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <CategoryIcon name={t.isTransfer ? "Transfer" : (t.category?.name ?? "")} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text testID="txn-detail-title" variant="listName" color={ROLE.ink} numberOfLines={1}>
            {rowTitle(t)}
          </Text>
          {t.note ? (
            <Text variant="small" color={ROLE.muted}>
              {t.note}
            </Text>
          ) : null}
        </View>
      </View>
      {alreadySaved ? (
        // native only: a create retried after a lost answer, whose first try had landed
        <View style={{ marginTop: 16 }}>
          <WarnLine testID="txn-detail-replayed">{ALREADY_SAVED}</WarnLine>
        </View>
      ) : null}
      <PixelFrame testID="txn-detail-facts" frame="px-card" style={{ marginTop: 16, padding: 12 }}>
        {rows.map(([label, value], i) => (
          <Detail key={label} label={label} first={i === 0} last={i === rows.length - 1}>
            {value}
          </Detail>
        ))}
      </PixelFrame>
      {error ? (
        <View style={{ marginTop: 8 }}>
          <FieldError testID="txn-detail-error">{error}</FieldError>
        </View>
      ) : null}
      <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Button testID="txn-detail-edit" variant="secondary" icon="edit" style={{ flex: 1 }} onPress={() => onEdit(t)}>
          Edit
        </Button>
        <Button testID="txn-detail-transfer" variant="secondary" icon="transfer" style={{ flex: 1 }} disabled={pending} onPress={() => void toggle()}>
          {t.isTransfer ? "Remove transfer" : "Mark as transfer"}
        </Button>
      </View>
    </Overlay>
  );
}

/**
 * The accounts and categories the form lists, or its loading / failed state inside the sheet. `onRetry` is the failed
 * state's Try again (a fresh load). `notice` is the pull contract's: a reload of either list failed and kept the older
 * one, so the sheet says its lists may be out of date; `onRefresh` re-reads them in place, the form and its edits kept.
 */
export type TransactionFormData = {
  accounts: LoadState<AccountsData>;
  categories: LoadState<MobileCategory[]>;
  onRetry: () => void;
  notice: string | null;
  onRefresh: () => void;
};

function FormGate({ data, children }: { data: TransactionFormData; children: (accounts: AccountsData, categories: MobileCategory[]) => ReactNode }) {
  const { accounts, categories } = data;
  if (accounts.status === "error" || categories.status === "error") {
    const message = accounts.status === "error" ? accounts.message : categories.status === "error" ? categories.message : "";
    return (
      <View testID="txn-form-failed" style={{ gap: 12, alignItems: "flex-start" }}>
        <FieldError>{message}</FieldError>
        <Button variant="secondary" onPress={data.onRetry}>
          Try again
        </Button>
      </View>
    );
  }
  if (accounts.status !== "ready" || categories.status !== "ready") {
    return (
      <View testID="txn-form-loading" style={{ gap: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} width="100%" height={44} />
        ))}
      </View>
    );
  }
  return (
    <>
      {data.notice ? (
        // native only: never older accounts or categories offered as current
        <View style={{ marginBottom: 16 }}>
          <WarnLine testID="txn-form-notice" action={{ label: "Retry", onPress: data.onRefresh }}>
            {`These accounts and categories may be out of date. ${data.notice}`}
          </WarnLine>
        </View>
      ) : null}
      {children(accounts.data, categories.data)}
    </>
  );
}

/** "Add transaction" (web `add-transaction.tsx`): the form in a sheet, "Add" to save; `onClose` hears what was saved. */
export function AddTransactionSheet({
  data,
  defaultDate,
  commands,
  onClose,
}: {
  data: TransactionFormData;
  defaultDate: string;
  commands: TransactionCommands;
  onClose: (saved?: Saved) => void;
}) {
  return (
    <Overlay title="Add transaction" onClose={() => onClose()}>
      <FormGate data={data}>
        {(accounts, categories) => (
          <TransactionForm
            accounts={accounts.accounts}
            categories={categories}
            defaultDate={defaultDate}
            submitLabel="Add"
            save={(draft, requestId) => commands.create(draft, requestId)}
            onDone={(_saved, what) => onClose(what)}
          />
        )}
      </FormGate>
    </Overlay>
  );
}

/** "Add income" (web `income-tile.tsx`, Home): the form locked to money in, income categories only, "Add" to save. */
export function AddIncomeSheet({
  data,
  defaultDate,
  commands,
  onClose,
}: {
  data: TransactionFormData;
  defaultDate: string;
  commands: TransactionCommands;
  onClose: () => void;
}) {
  return (
    <Overlay title="Add income" onClose={onClose}>
      <FormGate data={data}>
        {(accounts, categories) => (
          <TransactionForm
            accounts={accounts.accounts}
            categories={categories}
            defaultDate={defaultDate}
            initialDirection="credit"
            lockDirection
            submitLabel="Add"
            save={(draft, requestId) => commands.create(draft, requestId)}
            onDone={onClose}
          />
        )}
      </FormGate>
    </Overlay>
  );
}

/** "Edit transaction" (web list's edit sheet): the form with "Save changes", then Delete transaction after a confirm. */
export function EditTransactionSheet({
  transaction,
  data,
  commands,
  onClose,
  confirm = confirmDelete,
}: {
  transaction: MobileTransaction;
  data: TransactionFormData;
  commands: TransactionCommands;
  onClose: () => void;
  confirm?: (onYes: () => void) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function remove() {
    confirm(async () => {
      setDeleting(true);
      const out = await commands.remove(transaction.id);
      setDeleting(false);
      if (out.status === "ok" || out.status === "missing") return onClose();
      setDeleteError(out.status === "error" ? out.message : "Could not delete this transaction.");
    });
  }

  return (
    <Overlay title="Edit transaction" onClose={onClose}>
      <FormGate data={data}>
        {(accounts, categories) => (
          <>
            <TransactionForm
              accounts={accounts.accounts}
              categories={categories}
              initial={transaction}
              defaultDate={transaction.occurredAt.slice(0, 10)}
              submitLabel="Save changes"
              save={(draft) => commands.update(transaction.id, draft)}
              onDone={onClose}
              onGone={onClose}
            />
            <Button testID="txn-delete" variant="danger" style={{ marginTop: 12 }} disabled={deleting} onPress={remove}>
              Delete transaction
            </Button>
            {deleteError ? (
              <View style={{ marginTop: 8 }}>
                <FieldError testID="txn-delete-error">{deleteError}</FieldError>
              </View>
            ) : null}
          </>
        )}
      </FormGate>
    </Overlay>
  );
}

