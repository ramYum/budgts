"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_COLORS } from "@/lib/validation/category";
import type { CategoryActionState } from "@/server/categories";

const field =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

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
  onDone: () => void;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<CategoryActionState, FormData>(action, {});
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

      <fieldset className="space-y-1">
        <legend className="text-xs font-medium text-muted">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLORS.map((c, i) => (
            <label key={c} className="cursor-pointer">
              <input
                type="radio"
                name="color"
                value={c}
                defaultChecked={initial ? initial.color === c : i === 0}
                className="peer sr-only"
              />
              <span
                className="block h-7 w-7 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-accent"
                style={{ background: c }}
              />
            </label>
          ))}
        </div>
      </fieldset>

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
