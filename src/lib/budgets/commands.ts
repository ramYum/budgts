/**
 * Budget commands (set / clear one category's month, copy last month). They live beside, not inside, `src/lib/budget/`,
 * which stays pure money math with no database access. Shared by the web Server Actions
 * (`src/server/budgets.ts`) and the native `/api/mobile/budgets*` routes. Validation is the shared `budgetFormSchema`; the
 * amount arrives as a decimal string and is stored in integer minor units. Callers pass the CALLER'S Supabase client (RLS).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { monthKey } from "@/lib/budget/month";
import { invalid, type Failed, type Invalid, type Locked, type MissingReference } from "@/lib/command-result";
import { lockedOr, referencesVisible } from "@/lib/ownership";
import { budgetFormSchema } from "@/lib/validation/budget";

const MONTH_RE = /^\d{4}-\d{2}$/;
const monthStartDate = (month: string) => `${month}-01`;

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return monthKey(new Date(Date.UTC(y, m - 2, 1)));
}

export type BudgetResult = { ok: true } | Invalid | MissingReference | Locked | Failed;

/** Upserts one category's budget for a month, or clears it when the amount is empty or zero. */
export async function setBudget(supabase: SupabaseClient, userId: string, raw: unknown): Promise<BudgetResult> {
  const parsed = budgetFormSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  const { categoryId, month, amount } = parsed.data;
  // The category must be the caller's own: a foreign id would otherwise be stored (see src/lib/ownership.ts).
  const owned = await referencesVisible(supabase, "categories", [categoryId]);
  if (!owned.ok) return owned.error === "missing" ? { ok: false, error: "missing_reference" } : owned;

  if (amount === 0) {
    const { error, count } = await supabase
      .from("budgets")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("category_id", categoryId)
      .eq("month", monthStartDate(month));
    if (error) return lockedOr(supabase, { ok: false, error: "failed", message: error.message } as const);
    // Nothing cleared is fine (there was no budget), unless the deletion lock refused it.
    if (count === 0) return lockedOr(supabase, { ok: true } as const);
  } else {
    const { error } = await supabase
      .from("budgets")
      .upsert({ user_id: userId, category_id: categoryId, month: monthStartDate(month), amount }, { onConflict: "user_id,category_id,month" });
    if (error) return lockedOr(supabase, { ok: false, error: "failed", message: error.message } as const);
  }
  return { ok: true };
}

export type CopyBudgetsResult = { ok: true } | Invalid | { ok: false; error: "nothing_to_copy" } | Locked | Failed;

/** Copies every budget amount from the previous month into `month` (upsert). */
export async function copyBudgetsFromPreviousMonth(
  supabase: SupabaseClient,
  userId: string,
  month: string,
): Promise<CopyBudgetsResult> {
  if (!MONTH_RE.test(month)) return { ok: false, error: "invalid", fieldErrors: { month: "Invalid month" } };

  const { data: previous, error: readError } = await supabase
    .from("budgets")
    .select("category_id, amount")
    .eq("user_id", userId)
    .eq("month", monthStartDate(prevMonth(month)));
  if (readError) return { ok: false, error: "failed", message: readError.message };
  if (!previous?.length) return { ok: false, error: "nothing_to_copy" };

  const rows = previous.map((b) => ({
    user_id: userId,
    category_id: b.category_id,
    month: monthStartDate(month),
    amount: b.amount,
  }));
  const { error } = await supabase.from("budgets").upsert(rows, { onConflict: "user_id,category_id,month" });
  if (error) return lockedOr(supabase, { ok: false, error: "failed", message: error.message } as const);
  return { ok: true };
}
