"use server";

import { revalidateUserData } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { contributionFormSchema, savingsGoalFormSchema } from "@/lib/validation/savings";

export type SavingsActionState = { error?: string; fieldError?: string; ok?: boolean };


async function withUser() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return { user, supabase: await createClient() };
}

/* ------------------------------- goals -------------------------------- */

export async function createGoal(
  _prev: SavingsActionState,
  formData: FormData,
): Promise<SavingsActionState> {
  const parsed = savingsGoalFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldError: parsed.error.issues[0]?.message ?? "Invalid goal" };

  const { user, supabase } = await withUser();
  const { name, targetAmount, targetDate } = parsed.data;
  const { error } = await supabase.from("savings_goals").insert({
    user_id: user.id,
    name,
    target_amount: targetAmount,
    target_date: targetDate,
  });
  if (error) return { error: error.message };
  revalidateUserData();
  return { ok: true };
}

export async function updateGoal(
  _prev: SavingsActionState,
  formData: FormData,
): Promise<SavingsActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing goal id" };
  const parsed = savingsGoalFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldError: parsed.error.issues[0]?.message ?? "Invalid goal" };

  const { supabase } = await withUser();
  const { name, targetAmount, targetDate } = parsed.data;
  const { error } = await supabase
    .from("savings_goals")
    .update({ name, target_amount: targetAmount, target_date: targetDate })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateUserData();
  return { ok: true };
}

export async function setGoalArchived(
  _prev: SavingsActionState,
  formData: FormData,
): Promise<SavingsActionState> {
  const id = String(formData.get("id") ?? "");
  const archived = formData.get("archived") === "1";
  if (!id) return { error: "Missing goal id" };

  const { supabase } = await withUser();
  const { error } = await supabase
    .from("savings_goals")
    .update({ is_archived: archived })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateUserData();
  return { ok: true };
}

/* --------------------------- contributions --------------------------- */

/** Insert one contribution; `sign` is +1 for "add", -1 for "withdraw / correct". */
async function insertContribution(
  formData: FormData,
  sign: 1 | -1,
): Promise<SavingsActionState> {
  const parsed = contributionFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldError: parsed.error.issues[0]?.message ?? "Invalid contribution" };
  }

  const { user, supabase } = await withUser();
  const { goalId, amount, occurredAt, note } = parsed.data;
  const { error } = await supabase.from("savings_contributions").insert({
    user_id: user.id,
    goal_id: goalId,
    amount: sign * amount,
    occurred_at: occurredAt,
    note,
  });
  if (error) return { error: error.message };
  revalidateUserData();
  return { ok: true };
}

export async function addContribution(
  _prev: SavingsActionState,
  formData: FormData,
): Promise<SavingsActionState> {
  return insertContribution(formData, 1);
}

export async function withdrawFromGoal(
  _prev: SavingsActionState,
  formData: FormData,
): Promise<SavingsActionState> {
  return insertContribution(formData, -1);
}

export async function deleteContribution(id: string): Promise<{ error?: string }> {
  if (!id) return { error: "Missing contribution id" };
  const { supabase } = await withUser();
  const { error } = await supabase.from("savings_contributions").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateUserData();
  return {};
}
