"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { copyBudgetsFromPreviousMonth as copyCommand, setBudget as setCommand } from "@/lib/budget/commands";
import { createClient, getSessionUser } from "@/lib/supabase/server";

export type BudgetActionState = { error?: string; fieldError?: string; ok?: boolean };

function revalidate() {
  revalidatePath("/");
  revalidatePath("/budgets");
}

async function withUser() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return { user, supabase: await createClient() };
}

/** Upsert (or clear, when amount is 0) one category's budget for a month. Web adapter: the rules live in
 * `@/lib/budget/commands`, shared with the native `/api/mobile/budgets*` routes. */
export async function setBudget(
  _prev: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const { user, supabase } = await withUser();
  const result = await setCommand(supabase, user.id, Object.fromEntries(formData));
  if (!result.ok) {
    return result.error === "invalid"
      ? { fieldError: Object.values(result.fieldErrors)[0] ?? "Invalid budget" }
      : { error: result.message };
  }
  revalidate();
  return { ok: true };
}

/** Copy every budget amount from the previous month into `month` (upsert). */
export async function copyBudgetsFromPreviousMonth(
  _prev: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const { user, supabase } = await withUser();
  const result = await copyCommand(supabase, user.id, String(formData.get("month") ?? ""));
  if (!result.ok) {
    if (result.error === "invalid") return { error: "Invalid month" };
    if (result.error === "nothing_to_copy") return { error: "There were no budgets last month to copy." };
    return { error: result.message };
  }
  revalidate();
  return { ok: true };
}
