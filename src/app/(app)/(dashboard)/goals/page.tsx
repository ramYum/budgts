import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { goalProgress, goalsSummary, type SavingsContribution, type SavingsGoal } from "@/lib/budget/savings";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { GoalsView } from "@/components/goals-view";
import { RealtimeRefresh } from "@/components/realtime-refresh";

export const metadata: Metadata = { title: "Goals" };

export default async function GoalsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();

  const [{ data: goalRows }, { data: contribRows }, { data: profile }] = await Promise.all([
    supabase
      .from("savings_goals")
      .select("id, name, target_amount, target_date, is_archived")
      .eq("is_archived", false)
      .order("created_at"),
    supabase.from("savings_contributions").select("goal_id, amount"),
    supabase.from("profiles").select("currency").eq("id", user.id).single(),
  ]);

  const goals: SavingsGoal[] = (goalRows ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    targetAmount: g.target_amount,
    targetDate: g.target_date,
    isArchived: g.is_archived,
  }));
  const contributions: SavingsContribution[] = (contribRows ?? []).map((c) => ({
    goalId: c.goal_id,
    amount: c.amount,
  }));

  const items = goals.map((g) => goalProgress(g, contributions));
  const summary = goalsSummary(goals, contributions);

  return (
    <div className="pb-2">
      <RealtimeRefresh tables={["savings_goals", "savings_contributions"]} />
      <GoalsView items={items} summary={summary} currency={profile?.currency ?? "USD"} />
    </div>
  );
}
