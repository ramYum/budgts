"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { monthKey } from "@/lib/budget/month";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { budgetFormSchema } from "@/lib/validation/budget";

export type BudgetActionState = { error?: string; fieldError?: string; ok?: boolean };

function monthStartDate(month: string): string {
  return `${month}-01`;
}

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return monthKey(new Date(Date.UTC(y, m - 2, 1)));
}

function revalidate() {
  revalidatePath("/");
  revalidatePath("/budgets");
}

/** Upsert (or clear, when amount is 0) one category's budget for a month. */
export async function setBudget(
  _prev: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const parsed = budgetFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldError: parsed.error.issues[0]?.message ?? "Invalid budget" };
  }

  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();
  const { categoryId, month, amount } = parsed.data;

  if (amount === 0) {
    const { error } = await supabase
      .from("budgets")
      .delete()
      .eq("user_id", user.id)
      .eq("category_id", categoryId)
      .eq("month", monthStartDate(month));
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("budgets").upsert(
      { user_id: user.id, category_id: categoryId, month: monthStartDate(month), amount },
      { onConflict: "user_id,category_id,month" },
    );
    if (error) return { error: error.message };
  }

  revalidate();
  return { ok: true };
}

/** Copy every budget amount from the previous month into `month` (upsert). */
export async function copyBudgetsFromPreviousMonth(
  _prev: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const month = String(formData.get("month") ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Invalid month" };

  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();

  const { data: previous, error: readErr } = await supabase
    .from("budgets")
    .select("category_id, amount")
    .eq("user_id", user.id)
    .eq("month", monthStartDate(prevMonth(month)));
  if (readErr) return { error: readErr.message };
  if (!previous?.length) return { error: "There were no budgets last month to copy." };

  const rows = previous.map((b) => ({
    user_id: user.id,
    category_id: b.category_id,
    month: monthStartDate(month),
    amount: b.amount,
  }));
  const { error } = await supabase
    .from("budgets")
    .upsert(rows, { onConflict: "user_id,category_id,month" });
  if (error) return { error: error.message };

  revalidate();
  return { ok: true };
}
