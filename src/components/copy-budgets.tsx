"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { copyBudgetsFromPreviousMonth, type BudgetActionState } from "@/server/budgets";

export function CopyBudgets({ month }: { month: string }) {
  const [state, action, pending] = useActionState<BudgetActionState, FormData>(
    copyBudgetsFromPreviousMonth,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="month" value={month} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
      >
        {pending ? "Copying…" : "Copy last month"}
      </button>
      {state.error ? <span className="text-xs text-muted">{state.error}</span> : null}
    </form>
  );
}
