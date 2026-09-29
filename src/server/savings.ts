"use server";

import { revalidateUserData } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import {
  addContribution as addContributionCommand,
  createGoal as createGoalCommand,
  deleteContribution as deleteContributionCommand,
  setGoalArchived as setGoalArchivedCommand,
  updateGoal as updateGoalCommand,
} from "@/lib/goals/commands";
import { LOCKED_MESSAGE } from "@/lib/ownership";

export type SavingsActionState = { error?: string; fieldError?: string; ok?: boolean };

// The rules live in `@/lib/goals/commands`, shared with the native `/api/mobile/goals*` routes; these adapt them to forms.

async function withUser() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return { user, supabase: await createClient() };
}

const GOAL_GONE = "That goal no longer exists. Refresh and try again.";

type Outcome =
  | { ok: true; id?: string }
  | { ok: false; error: "invalid"; fieldErrors: Record<string, string> }
  | { ok: false; error: "missing" }
  | { ok: false; error: "locked" }
  | { ok: false; error: "failed"; message: string };

function toState(result: Outcome, invalidFallback: string): SavingsActionState {
  if (result.ok) {
    revalidateUserData();
    return { ok: true };
  }
  switch (result.error) {
    case "invalid":
      return { fieldError: Object.values(result.fieldErrors)[0] ?? invalidFallback };
    case "missing":
      return { error: GOAL_GONE };
    case "locked":
      return { error: LOCKED_MESSAGE };
    default:
      return { error: result.message };
  }
}

/* ------------------------------- goals -------------------------------- */

export async function createGoal(_prev: SavingsActionState, formData: FormData): Promise<SavingsActionState> {
  const { user, supabase } = await withUser();
  return toState(await createGoalCommand(supabase, user.id, Object.fromEntries(formData)), "Invalid goal");
}

export async function updateGoal(_prev: SavingsActionState, formData: FormData): Promise<SavingsActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing goal id" };
  const { supabase } = await withUser();
  return toState(await updateGoalCommand(supabase, id, Object.fromEntries(formData)), "Invalid goal");
}

export async function setGoalArchived(_prev: SavingsActionState, formData: FormData): Promise<SavingsActionState> {
  const id = String(formData.get("id") ?? "");
  const archived = formData.get("archived") === "1";
  if (!id) return { error: "Missing goal id" };
  const { supabase } = await withUser();
  return toState(await setGoalArchivedCommand(supabase, id, archived), "Invalid goal");
}

/* --------------------------- contributions --------------------------- */

export async function addContribution(_prev: SavingsActionState, formData: FormData): Promise<SavingsActionState> {
  const { user, supabase } = await withUser();
  return toState(await addContributionCommand(supabase, user.id, Object.fromEntries(formData), 1), "Invalid contribution");
}

export async function withdrawFromGoal(_prev: SavingsActionState, formData: FormData): Promise<SavingsActionState> {
  const { user, supabase } = await withUser();
  return toState(await addContributionCommand(supabase, user.id, Object.fromEntries(formData), -1), "Invalid contribution");
}

export async function deleteContribution(id: string): Promise<{ error?: string }> {
  if (!id) return { error: "Missing contribution id" };
  const { supabase } = await withUser();
  const result = await deleteContributionCommand(supabase, id);
  if (!result.ok) {
    if (result.error === "missing") return { error: "That contribution no longer exists." };
    return { error: result.error === "locked" ? LOCKED_MESSAGE : result.message };
  }
  revalidateUserData();
  return {};
}
