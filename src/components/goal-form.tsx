"use client";

import { useActionState, useEffect } from "react";
import type { SavingsActionState } from "@/server/savings";
import { Button, fieldClass as field, labelClass as label } from "./ui";


export type GoalInitial = {
  id: string;
  name: string;
  targetAmount: string; // major-unit string, e.g. "10000.00"
  targetDate: string | null; // YYYY-MM-DD
};

export function GoalForm({
  action,
  initial,
  onDone,
  submitLabel,
}: {
  action: (prev: SavingsActionState, formData: FormData) => Promise<SavingsActionState>;
  initial?: GoalInitial;
  onDone: () => void;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<SavingsActionState, FormData>(action, {});

  useEffect(() => {
    if (state.ok) {
      onDone();
    }
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      <label className={label}>
        Name
        <input
          className={field}
          name="name"
          defaultValue={initial?.name ?? ""}
          maxLength={60}
          required
          autoFocus
          placeholder="Emergency fund"
        />
      </label>

      <label className={label}>
        Target amount
        <input
          className={field}
          name="targetAmount"
          inputMode="decimal"
          placeholder="10000.00"
          defaultValue={initial?.targetAmount ?? ""}
          required
        />
      </label>

      <label className={label}>
        Target date (optional)
        <input
          className={field}
          type="date"
          name="targetDate"
          defaultValue={initial?.targetDate ?? ""}
        />
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
