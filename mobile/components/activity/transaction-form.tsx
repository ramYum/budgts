import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import type { MobileAccount } from "../../lib/accounts/accounts-api";
import type { MutationOutcome } from "../../lib/api/load";
import type { MobileCategory } from "../../lib/categories/categories-api";
import {
  draftFromTransaction,
  emptyDraft,
  newRequestId,
  validateDraft,
  type TransactionDraft,
} from "../../lib/transactions/form";
import type { Direction, MobileTransaction } from "../../lib/transactions/transactions-api";
import { Button, Field } from "../brand/controls";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { Checkbox } from "../kit/checkbox";
import { DateField } from "../kit/date-field";
import { Select } from "../kit/select";

const NONE = "";

/** A field's error line under it (web `text-sm text-neg`). */
export function FieldError({ children, testID }: { children?: string | null; testID?: string }) {
  if (!children) return null;
  return (
    <Text testID={testID} variant="small" color={ROLE.neg} accessibilityRole="alert">
      {children}
    </Text>
  );
}

/** The server names the date `occurredAt`; the form calls it `date`. */
function fieldErrorsOf(fe: Record<string, string>): Record<string, string> {
  return fe.occurredAt ? { ...fe, date: fe.occurredAt } : fe;
}

export type SaveDraft = (draft: TransactionDraft, requestId: string | undefined) => Promise<MutationOutcome>;

/**
 * What a save left behind: the saved row's id (a create answers it), and whether the server answered `replayed`: this
 * request id had already landed (an earlier try whose answer was lost), so `id` is that first row and the values sent
 * this time, including any changes typed in between, were not applied (create stays idempotent and never merges).
 */
export type Saved = { id: string | undefined; replayed: boolean };

/**
 * The add / edit form (web `src/components/transaction-form.tsx`): Amount and Direction side by side, Account, Category
 * ("Uncategorized" first, income categories marked), Date, Description, Note, the transfer box, then Save and Cancel. Every
 * rule is the server's: `validateDraft` only stops an empty submit, and each field error the server names is shown under
 * that field. A new transaction carries one request id for the life of the form, so a retried Save lands once.
 */
export function TransactionForm({
  accounts,
  categories,
  initial,
  defaultDate,
  submitLabel,
  save,
  onDone,
  onGone,
  initialDirection = "debit",
  lockDirection = false,
}: {
  accounts: MobileAccount[];
  categories: MobileCategory[];
  /** the row being edited; absent for a new one */
  initial?: MobileTransaction;
  /** `YYYY-MM-DD`: today in the shown month, else its 15th (the web's rule) */
  defaultDate: string;
  submitLabel: string;
  save: SaveDraft;
  /** saved (with what was saved) or cancelled: close the sheet */
  onDone: (saved: boolean, what?: Saved) => void;
  /** the row no longer exists */
  onGone?: () => void;
  /** the direction a new entry starts with, e.g. "credit" for Home's Add income (web `initialDirection`) */
  initialDirection?: Direction;
  /**
   * a new entry's direction is fixed: shown read-only, and money in lists only income categories (web `lockDirection`).
   * Ignored when editing.
   */
  lockDirection?: boolean;
}) {
  const directionLocked = lockDirection && !initial;
  // A manual entry goes on an account that can still take one; an edited row keeps its own account listed, at the end as
  // the web appends it, even when it no longer can (a disconnected bank's), so saving never moves it silently. A bank row
  // keeps its account outright: shown, not chosen (owner decision 2026-09-30; the server refuses a move too).
  const selectable = accounts.filter((a) => a.selectable).map((a) => ({ value: a.id, label: a.name }));
  const accountOptions =
    initial && !selectable.some((a) => a.value === initial.account.id)
      ? [...selectable, { value: initial.account.id, label: initial.account.name }]
      : selectable;
  const accountLocked = initial?.source === "bank";
  const visibleCategories = directionLocked && initialDirection === "credit" ? categories.filter((c) => c.kind === "income") : categories;
  const categoryOptions = [
    { value: NONE, label: "Uncategorized" },
    ...visibleCategories.map((c) => ({ value: c.id, label: `${c.name}${!directionLocked && c.kind === "income" ? " (income)" : ""}` })),
  ];

  const [draft, setDraft] = useState<TransactionDraft>(() =>
    initial
      ? draftFromTransaction(initial)
      : {
          ...emptyDraft(defaultDate, selectable[0]?.value ?? null),
          direction: initialDirection,
          // the web's default category: money in starts on the first income category
          categoryId: initialDirection === "credit" ? (visibleCategories.find((c) => c.kind === "income")?.id ?? null) : null,
        },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const requestId = useRef(initial ? undefined : newRequestId());
  const set = (patch: Partial<TransactionDraft>) => setDraft((d) => ({ ...d, ...patch }));

  async function submit() {
    const local = validateDraft(draft);
    setErrors(local);
    setMessage(null);
    if (Object.keys(local).length > 0) return;
    setPending(true);
    const out = await save(draft, requestId.current);
    setPending(false);
    switch (out.status) {
      case "ok":
        return onDone(true, { id: out.id, replayed: out.replayed === true });
      case "invalid":
        return setErrors(fieldErrorsOf(out.fieldErrors));
      case "conflict":
        return setMessage("This transaction changed while you were editing it. Close this and open it again.");
      case "missing":
        return onGone ? onGone() : setMessage("This transaction no longer exists.");
      case "error":
        return setMessage(out.message);
      default:
        return setMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <View testID="txn-form" style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Field
              testID="txn-form-amount"
              label="Amount"
              value={draft.amount}
              onChangeText={(amount) => set({ amount })}
              keyboardType="decimal-pad"
              placeholder="0.00"
              invalid={!!errors.amount}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            {directionLocked ? (
              // the web's fixed direction: a px-band line, 16/24 graphite
              <View style={{ gap: 6 }}>
                <Text variant="formLabel" color={COLOR.graphite}>
                  Direction
                </Text>
                <PixelFrame
                  testID="txn-form-direction-locked"
                  frame="px-band"
                  accessibilityLabel={`Direction, ${initialDirection === "credit" ? "Money in" : "Money out"}`}
                  style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                >
                  <Text variant="input" color={COLOR.graphite}>
                    {initialDirection === "credit" ? "Money in" : "Money out"}
                  </Text>
                </PixelFrame>
              </View>
            ) : (
              <Select<Direction>
                testID="txn-form-direction"
                label="Direction"
                value={draft.direction}
                options={[
                  { value: "debit", label: "Money out" },
                  { value: "credit", label: "Money in" },
                ]}
                onChange={(direction) => set({ direction })}
              />
            )}
          </View>
        </View>
        <FieldError testID="txn-form-amount-error">{errors.amount}</FieldError>
      </View>

      <View style={{ gap: 6 }}>
        {accountLocked ? (
          // the web's read-only account for a bank row: a px-band line, 16/24 graphite, the account name
          <View style={{ gap: 6 }}>
            <Text variant="formLabel" color={COLOR.graphite}>
              Account
            </Text>
            <PixelFrame testID="txn-form-account-locked" frame="px-band" accessibilityLabel={`Account, ${initial!.account.name}`} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text variant="input" color={COLOR.graphite}>
                {initial!.account.name}
              </Text>
            </PixelFrame>
          </View>
        ) : (
          <Select
            testID="txn-form-account"
            label="Account"
            value={draft.accountId}
            options={accountOptions}
            onChange={(accountId) => set({ accountId })}
            invalid={!!errors.accountId}
          />
        )}
        <FieldError testID="txn-form-account-error">{errors.accountId}</FieldError>
      </View>

      <View style={{ gap: 6 }}>
        <Select
          testID="txn-form-category"
          label="Category"
          value={draft.categoryId ?? NONE}
          options={categoryOptions}
          onChange={(v) => set({ categoryId: v === NONE ? null : v })}
          invalid={!!errors.categoryId}
        />
        <FieldError>{errors.categoryId}</FieldError>
      </View>

      <View style={{ gap: 6 }}>
        <DateField testID="txn-form-date" label="Date" value={draft.date} onChange={(date) => set({ date })} invalid={!!errors.date} />
        <FieldError testID="txn-form-date-error">{errors.date}</FieldError>
      </View>

      <View style={{ gap: 6 }}>
        <Field
          testID="txn-form-description"
          label="Description"
          value={draft.description}
          onChangeText={(description) => set({ description })}
          maxLength={200}
          invalid={!!errors.description}
        />
        <FieldError>{errors.description}</FieldError>
      </View>

      <View style={{ gap: 6 }}>
        <Field
          testID="txn-form-note"
          label="Note (optional)"
          rows={2}
          value={draft.note}
          onChangeText={(note) => set({ note })}
          maxLength={1000}
          invalid={!!errors.note}
        />
        <FieldError>{errors.note}</FieldError>
      </View>

      {/* the web's <label>: the words toggle the box too */}
      <Pressable
        accessible={false}
        onPress={() => set({ isTransfer: !draft.isTransfer })}
        style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <Checkbox
          testID="txn-form-transfer"
          tone="ink"
          checked={draft.isTransfer}
          onChange={(isTransfer) => set({ isTransfer })}
          accessibilityLabel="Transfer between my own accounts (excluded from spend & income)"
        />
        <Text variant="small" color={COLOR.graphite} style={{ flexShrink: 1 }}>
          {"Transfer between my own accounts (excluded from spend & income)"}
        </Text>
      </Pressable>

      <FieldError testID="txn-form-message">{message}</FieldError>

      <View style={{ flexDirection: "row", gap: 12, paddingTop: 8 }}>
        <Button testID="txn-form-save" loading={pending} style={{ flex: 1 }} onPress={() => void submit()}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button testID="txn-form-cancel" variant="secondary" disabled={pending} onPress={() => onDone(false)}>
          Cancel
        </Button>
      </View>
    </View>
  );
}

/** What a transfer toggle sends: the row as it is, with only `isTransfer` flipped (the web's `toggleTransfer`). */
export function transferToggleDraft(t: MobileTransaction): TransactionDraft {
  return { ...draftFromTransaction(t), isTransfer: !t.isTransfer };
}
