"use client";

import { useActionState } from "react";
import { copyBudgetsFromPreviousMonth, type BudgetActionState } from "@/server/budgets";
import { TextButton } from "./ui";

export function CopyBudgets({ month }: { month: string }) {
  const [state, action, pending] = useActionState<BudgetActionState, FormData>(
    copyBudgetsFromPreviousMonth,
    {},
  );
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="month" value={month} />
      <TextButton type="submit" disabled={pending} iconAfter="copy" className="font-semibold text-ink">
        {pending ? "Copying…" : "Copy last month"}
      </TextButton>
      {state.error ? <span className="text-sm text-muted">{state.error}</span> : null}
    </form>
  );
}
