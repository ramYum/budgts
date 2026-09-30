import { useState } from "react";
import * as Crypto from "expo-crypto";
import { View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import type { MobileGoal } from "../../lib/goals/goals-api";
import { Button, Field } from "../brand/controls";
import { Text } from "../brand/text";
import { DateField } from "../kit/date-field";
import { Overlay } from "../kit/overlay";

/**
 * Saves the form; resolves to the message to show, or null once saved. `requestId` is the sheet's one idempotency key for
 * a create (the same on every retry from this sheet, so a lost response can never land the save twice); null for an edit.
 */
export type Submit<T> = (values: T, requestId: string | null) => Promise<string | null>;

export type GoalValues = { name: string; targetAmount: string; targetDate: string | null };
export type ContributionValues = { amount: string; occurredAt: string; note: string | null };

/** A goal's form values as the web prefills them (goals-view.tsx `toInitial`): the target in major units, two decimals. */
export function goalInitial(g: MobileGoal): GoalValues {
  return { name: g.name, targetAmount: (g.target / 100).toFixed(2), targetDate: g.targetDate };
}

const blankToNull = (s: string) => (s.trim() === "" ? null : s.trim());

/** The web's form foot: the error line, then the submit (pending "Saving…") beside Cancel. */
function FormFoot({ error, pending, submitLabel, onSubmit, onCancel }: { error: string | null; pending: boolean; submitLabel: string; onSubmit: () => void; onCancel: () => void }) {
  return (
    <>
      {error ? (
        <Text testID="goal-form-error" variant="body" color={ROLE.neg} style={{ fontSize: 14, lineHeight: 20 }}>
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 12, paddingTop: 8 }}>
        <Button testID="goal-form-submit" loading={pending} style={{ flex: 1 }} onPress={onSubmit}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button testID="goal-form-cancel" variant="secondary" onPress={onCancel}>
          Cancel
        </Button>
      </View>
    </>
  );
}

function useSubmit<T>(submit: Submit<T>, onDone: () => void, requestId: string | null) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const run = async (values: T) => {
    if (pending) return;
    setError(null);
    setPending(true);
    const message = await submit(values, requestId);
    setPending(false);
    if (message) setError(message);
    else onDone();
  };
  return { error, pending, run };
}

/** New goal / Edit goal (web goal-form.tsx in its overlay): name, target amount, an optional target date. */
export function GoalFormSheet({
  title,
  submitLabel,
  initial,
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  initial?: GoalValues;
  onSubmit: Submit<GoalValues>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [targetAmount, setTargetAmount] = useState(initial?.targetAmount ?? "");
  const [targetDate, setTargetDate] = useState<string | null>(initial?.targetDate ?? null);
  // a create's one request id, kept for the life of the sheet; an edit needs none
  const [requestId] = useState(() => (initial ? null : Crypto.randomUUID()));
  const { error, pending, run } = useSubmit(onSubmit, onClose, requestId);
  const submit = () => void run({ name, targetAmount, targetDate });

  return (
    <Overlay title={title} onClose={onClose}>
      <View style={{ gap: 16 }}>
        <Field testID="goal-name" label="Name" value={name} onChangeText={setName} maxLength={60} placeholder="Emergency fund" autoFocus editable={!pending} />
        <Field
          testID="goal-target"
          label="Target amount"
          value={targetAmount}
          onChangeText={setTargetAmount}
          keyboardType="decimal-pad"
          placeholder="10000.00"
          editable={!pending}
        />
        <DateField testID="goal-date" label="Target date (optional)" value={targetDate} onChange={setTargetDate} disabled={pending} />
        <FormFoot error={error} pending={pending} submitLabel={submitLabel} onSubmit={submit} onCancel={onClose} />
      </View>
    </Overlay>
  );
}

/** Add to / Withdraw from a goal (web contribution-form.tsx in its overlay): a positive amount, the date (today), a note. */
export function ContributionSheet({
  title,
  submitLabel,
  hint,
  today,
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  hint?: string;
  /** the user's own date from the server, the default */
  today: string;
  onSubmit: Submit<ContributionValues>;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(today);
  const [note, setNote] = useState("");
  const [requestId] = useState(() => Crypto.randomUUID());
  const { error, pending, run } = useSubmit(onSubmit, onClose, requestId);
  const submit = () => void run({ amount, occurredAt, note: blankToNull(note) });

  return (
    <Overlay title={title} onClose={onClose}>
      <View style={{ gap: 16 }}>
        <View style={{ gap: 16 }}>
          <Field testID="goal-amount" label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" autoFocus editable={!pending} />
          {hint ? (
            <Text testID="goal-contribution-hint" variant="body" color={ROLE.muted} style={{ fontSize: 14, lineHeight: 20 }}>
              {hint}
            </Text>
          ) : null}
        </View>
        <DateField testID="goal-contribution-date" label="Date" value={occurredAt} onChange={setOccurredAt} disabled={pending} />
        <Field testID="goal-note" label="Note (optional)" value={note} onChangeText={setNote} maxLength={200} editable={!pending} onSubmitEditing={submit} />
        <FormFoot error={error} pending={pending} submitLabel={submitLabel} onSubmit={submit} onCancel={onClose} />
      </View>
    </Overlay>
  );
}
