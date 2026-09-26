"use client";

import { useActionState, useEffect } from "react";
import { CATEGORY_COLORS } from "@/lib/categories/options";
import type { CategoryActionState } from "@/server/categories";
import { Button, Select, fieldClass as field, labelClass as label } from "./ui";


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
    <form action={formAction} className="space-y-4">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      <label className={label}>
        Name
        <input className={field} name="name" defaultValue={initial?.name ?? ""} maxLength={40} required autoFocus />
      </label>

      <label className={label}>
        Type
        <Select name="kind" defaultValue={initial?.kind ?? "expense"}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </Select>
      </label>

      <input type="hidden" name="color" value={initial?.color ?? CATEGORY_COLORS[0]} />

      {state.fieldError || state.error ? (
        <p className="text-sm text-neg">{state.fieldError ?? state.error}</p>
      ) : null}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button variant="secondary" onClick={() => onDone()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
