"use client";

import { useActionState } from "react";
import { copyBudgetsFromPreviousMonth, type BudgetActionState } from "@/server/budgets";

export function CopyBudgets({ month }: { month: string }) {
  const [state, action, pending] = useActionState<BudgetActionState, FormData>(
    copyBudgetsFromPreviousMonth,
    {},
  );
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="month" value={month} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
      >
        {pending ? "Copying…" : "Copy last month"}
      </button>
      {state.error ? <span className="text-xs text-muted">{state.error}</span> : null}
    </form>
  );
}
