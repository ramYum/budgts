"use client";

import { useActionState, useEffect } from "react";
import { CATEGORY_COLORS } from "@/lib/validation/category";
import type { CategoryActionState } from "@/server/categories";

const field =
  "w-full rounded-xl border border-hairline bg-surface px-3.5 py-3 text-sm outline-none transition-colors focus:border-ink";

export type CategoryInitial = {
  id: string;
  name: string;
  kind: "expense" | "income";
  color: string;
};

export function CategoryForm({
  action,
  initial,
  onDone,
  submitLabel,
}: {
  action: (prev: CategoryActionState, formData: FormData) => Promise<CategoryActionState>;
  initial?: CategoryInitial;
  /** Called on success. `created` is set only for a new category (`createCategory`). */
  onDone: (created?: { id: string; name: string }) => void;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<CategoryActionState, FormData>(action, {});

  useEffect(() => {
    if (state.ok) {
      onDone(state.id ? { id: state.id, name: state.name ?? "" } : undefined);
    }
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-3">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      <label className="block space-y-1 text-xs font-medium text-muted">
        Name
        <input className={field} name="name" defaultValue={initial?.name ?? ""} maxLength={40} required autoFocus />
      </label>

      <label className="block space-y-1 text-xs font-medium text-muted">
        Type
        <select className={field} name="kind" defaultValue={initial?.kind ?? "expense"}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </label>

      <input type="hidden" name="color" value={initial?.color ?? CATEGORY_COLORS[0]} />

      {state.fieldError || state.error ? (
        <p className="text-sm text-neg">{state.fieldError ?? state.error}</p>
      ) : null}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 press rounded-xl bg-primary-btn px-4 py-3 text-sm font-medium text-on-primary-btn disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={() => onDone()}
          className="press rounded-xl border border-hairline bg-surface px-3.5 py-3 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
