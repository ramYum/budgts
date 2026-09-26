"use client";

import { useActionState, useEffect } from "react";
import type { SavingsActionState } from "@/server/savings";
import { localDateKey } from "@/lib/local-date";
import { Button, fieldClass as field, labelClass as label } from "./ui";


/**
 * One contribution against a goal. Reused for both "Add" and "Withdraw / correct"
 * — the caller passes the matching server action, submit label and hint. The
 * amount is always entered as a positive number; the withdraw action negates it.
 */
export function ContributionForm({
  action,
  goalId,
  submitLabel,
  hint,
  onDone,
}: {
  action: (prev: SavingsActionState, formData: FormData) => Promise<SavingsActionState>;
  goalId: string;
  submitLabel: string;
  hint?: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<SavingsActionState, FormData>(action, {});
  // The user's calendar day, not UTC's (only rendered client-side, in an overlay).
  const today = localDateKey();

  useEffect(() => {
    if (state.ok) {
      onDone();
    }
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="goalId" value={goalId} />

      <label className={label}>
        Amount
        <input
          className={field}
          name="amount"
          inputMode="decimal"
          placeholder="0.00"
          required
          autoFocus
        />
      </label>
      {hint ? <p className="text-sm leading-5 text-muted">{hint}</p> : null}

      <label className={label}>
        Date
        <input className={field} type="date" name="occurredAt" defaultValue={today} required />
      </label>

      <label className={label}>
        Note (optional)
        <input className={field} name="note" maxLength={200} />
      </label>

      {state.fieldError || state.error ? (
        <p className="text-sm text-neg">{state.fieldError ?? state.error}</p>
      ) : null}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
