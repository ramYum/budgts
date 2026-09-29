/**
 * Savings goals' data: the reads behind the Goals screen and Home's savings card, and the authoritative progress math
 * over them (`goalProgress`, `goalsSummary` in `src/lib/budget/savings.ts`). One implementation, used by the web Goals page
 * (`src/app/(app)/(dashboard)/goals/page.tsx`), `loadHome`, and the native `GET /api/mobile/goals`, so the three can never
 * disagree about how much is saved. Moved out of the web page (2026-09-29, Stage 2B); no formula lives here.
 *
 * Framework-free: the caller supplies the Supabase client (the web cookie client or the native Bearer client; RLS scopes
 * both to the user). A failed read throws: a partial contribution list would silently understate what is saved.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  goalProgress,
  goalsSummary,
  type GoalProgress,
  type GoalsSummary,
  type SavingsContribution,
  type SavingsGoal,
} from "@/lib/budget/savings";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

export type GoalRows = { goals: SavingsGoal[]; contributions: SavingsContribution[] };

/** The user's active goals (oldest first) and every contribution, both paged past PostgREST's 1000-row cap. */
export async function loadGoalRows(supabase: SupabaseClient): Promise<GoalRows> {
  type GoalRow = { id: string; name: string; target_amount: number; target_date: string | null; is_archived: boolean };
  const [goalRows, contribRows] = await Promise.all([
    fetchAllRows<GoalRow>((from, to, count) =>
      supabase
        .from("savings_goals")
        .select("id, name, target_amount, target_date, is_archived", { count })
        .eq("is_archived", false)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    fetchAllRows<{ goal_id: string; amount: number }>((from, to, count) =>
      supabase
        .from("savings_contributions")
        .select("goal_id, amount", { count })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  const goals: SavingsGoal[] = goalRows.map((g) => ({
    id: g.id,
    name: g.name,
    targetAmount: g.target_amount,
    targetDate: g.target_date,
    isArchived: g.is_archived,
  }));
  const contributions: SavingsContribution[] = contribRows.map((c) => ({ goalId: c.goal_id, amount: c.amount }));
  return { goals, contributions };
}

export type GoalsData = { currency: string; items: GoalProgress[]; summary: GoalsSummary };

/** Everything the Goals screen shows: each goal's progress, the headline totals, and the currency to show them in. */
export async function loadGoals(supabase: SupabaseClient, userId: string): Promise<GoalsData> {
  const [rows, profile] = await Promise.all([
    loadGoalRows(supabase),
    supabase.from("profiles").select("currency").eq("id", userId).single(),
  ]);
  if (profile.error) throw new Error("profile_read_failed");
  return {
    currency: (profile.data as { currency: string } | null)?.currency ?? "USD",
    items: rows.goals.map((g) => goalProgress(g, rows.contributions)),
    summary: goalsSummary(rows.goals, rows.contributions),
  };
}
