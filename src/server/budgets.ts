"use server";

import { revalidateUserData } from "@/server/revalidate";
import { redirect } from "next/navigation";
import {
  copyBudgetsFromPreviousMonth as copyCommand,
  setBudget as setBudgetCommand,
} from "@/lib/budgets/commands";
import { createClient, getSessionUser } from "@/lib/supabase/server";

export type BudgetActionState = { error?: string; fieldError?: string; ok?: boolean };

async function withUser() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return { user, supabase: await createClient() };
}

/** Upsert (or clear, when amount is 0) one category's budget for a month.
 * The rule lives in `@/lib/budgets/commands`, shared with the native
 * `/api/mobile/budgets` route. */
export async function setBudget(
  _prev: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const { user, supabase } = await withUser();
  const result = await setBudgetCommand(supabase, user.id, Object.fromEntries(formData));
  if (!result.ok) {
    if (result.error === "invalid") return { fieldError: Object.values(result.fieldErrors)[0] ?? "Invalid budget" };
    return { error: result.error === "missing_reference" ? "That category no longer exists. Refresh and try again." : result.message };
  }
  revalidateUserData();
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
    switch (result.error) {
      case "invalid":
        return { error: "Invalid month" };
      case "nothing_to_copy":
        return { error: "There were no budgets last month to copy." };
      default:
        return { error: result.message };
    }
  }
  revalidateUserData();
  return { ok: true };
}
