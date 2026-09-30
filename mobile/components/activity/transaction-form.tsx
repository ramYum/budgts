import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { COLOR, PLACEHOLDER, ROLE } from "../../lib/brand/shared";
import { textStyle } from "../../lib/brand/type";
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
import { useSheetFocus } from "../kit/overlay";
import { Select } from "../kit/select";
import { DateField } from "./date-field";

const SMALL = { fontSize: 14, lineHeight: 20 } as const;
const NONE = "";

/** A field's error line under it (web `text-sm text-neg`). */
export function FieldError({ children, testID }: { children?: string | null; testID?: string }) {
  if (!children) return null;
  return (
    <Text testID={testID} variant="body" color={ROLE.neg} accessibilityRole="alert" style={SMALL}>
      {children}
    </Text>
  );
}

/** The note (web textarea, 2 rows, in the field frame): a 2-line input that grows no further than the web's. */
function NoteField({ value, onChangeText, testID }: { value: string; onChangeText: (v: string) => void; testID: string }) {
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  const revealInSheet = useSheetFocus();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="formLabel" color={COLOR.graphite}>
        Note (optional)
      </Text>
      <PixelFrame frame="px-field" state={focused ? ":focus-within" : ""} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
        <TextInput
          ref={input}
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          multiline
          numberOfLines={2}
          maxLength={1000}
          accessibilityLabel="Note (optional)"
          placeholderTextColor={PLACEHOLDER}
          cursorColor={ROLE.ink}
          selectionColor={COLOR.signal}
          onFocus={() => {
            setFocused(true);
            revealInSheet?.(input.current);
          }}
          onBlur={() => setFocused(false)}
          style={[textStyle("input"), { minHeight: 48, padding: 0, color: ROLE.ink, textAlignVertical: "top", includeFontPadding: false }]}
        />
      </PixelFrame>
    </View>
  );
}

/** The web's plain checkbox with `accent-color: ink`: a 16px white box with a 1px #767676 edge, filled ink with a white tick. */
function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View
      testID="txn-transfer-box"
      style={{ width: 16, height: 16, borderRadius: 2, borderWidth: checked ? 0 : 1, borderColor: "#767676", backgroundColor: checked ? ROLE.ink : COLOR.white }}
    >
      {checked ? (
        <Svg width={16} height={16}>
          <Path d="M3.5 8L6.5 11L12.5 5" fill="none" stroke={COLOR.white} strokeWidth={2} />
        </Svg>
      ) : null}
    </View>
  );
}

/** The server names the date `occurredAt`; the form calls it `date`. */
function fieldErrorsOf(fe: Record<string, string>): Record<string, string> {
  return fe.occurredAt ? { ...fe, date: fe.occurredAt } : fe;
}

export type SaveDraft = (draft: TransactionDraft, requestId: string | undefined) => Promise<MutationOutcome>;

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
}: {
  accounts: MobileAccount[];
  categories: MobileCategory[];
  /** the row being edited; absent for a new one */
  initial?: MobileTransaction;
  /** `YYYY-MM-DD`: today in the shown month, else its 15th (the web's rule) */
  defaultDate: string;
  submitLabel: string;
  save: SaveDraft;
  /** saved (or cancelled): close the sheet */
  onDone: (saved: boolean) => void;
  /** the row no longer exists */
  onGone?: () => void;
}) {
  // A manual entry goes on an account that can still take one; an edited row keeps its own account listed even when it
  // no longer can (a disconnected bank's), so saving never moves it silently.
  const selectable = accounts.filter((a) => a.selectable);
  const accountOptions =
    initial && !selectable.some((a) => a.id === initial.account.id)
      ? [{ value: initial.account.id, label: initial.account.name }, ...selectable.map((a) => ({ value: a.id, label: a.name }))]
      : selectable.map((a) => ({ value: a.id, label: a.name }));
  const categoryOptions = [
    { value: NONE, label: "Uncategorized" },
    ...categories.map((c) => ({ value: c.id, label: `${c.name}${c.kind === "income" ? " (income)" : ""}` })),
  ];

  const [draft, setDraft] = useState<TransactionDraft>(() =>
    initial ? draftFromTransaction(initial) : emptyDraft(defaultDate, selectable[0]?.id ?? null),
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
        return onDone(true);
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
          </View>
        </View>
        <FieldError testID="txn-form-amount-error">{errors.amount}</FieldError>
      </View>

      <View style={{ gap: 6 }}>
        <Select
          testID="txn-form-account"
          label="Account"
          value={draft.accountId}
          options={accountOptions}
          onChange={(accountId) => set({ accountId })}
          invalid={!!errors.accountId}
        />
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
        <NoteField testID="txn-form-note" value={draft.note} onChangeText={(note) => set({ note })} />
        <FieldError>{errors.note}</FieldError>
      </View>

      <Pressable
        testID="txn-form-transfer"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: draft.isTransfer }}
        accessibilityLabel="Transfer between my own accounts (excluded from spend & income)"
        onPress={() => set({ isTransfer: !draft.isTransfer })}
        style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <Checkbox checked={draft.isTransfer} />
        <Text variant="body" color={COLOR.graphite} style={[SMALL, { flexShrink: 1 }]}>
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
