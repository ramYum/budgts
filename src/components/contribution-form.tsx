"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { SavingsActionState } from "@/server/savings";
import { localDateKey } from "@/lib/local-date";

const field =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const label = "block space-y-1 text-xs font-medium text-muted";

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
  const router = useRouter();
  // The user's calendar day, not UTC's (only rendered client-side, in an overlay).
  const today = localDateKey();

  useEffect(() => {
    if (state.ok) {
      onDone();
      router.refresh();
    }
  }, [state.ok, onDone, router]);

  return (
    <form action={formAction} className="space-y-3">
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
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}

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

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-full bg-primary-btn px-3 py-2 text-sm font-medium text-on-primary-btn disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full border border-border px-3 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
