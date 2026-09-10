"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { SavingsActionState } from "@/server/savings";

const field =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const label = "block space-y-1 text-xs font-medium text-muted";

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
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      onDone();
      router.refresh();
    }
  }, [state.ok, onDone, router]);

  return (
    <form action={formAction} className="space-y-3">
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

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
