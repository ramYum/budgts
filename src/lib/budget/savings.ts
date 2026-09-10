/**
 * Savings-goal progress math. Pure functions over already-fetched rows — no DB
 * calls. Contributions carry a signed `amount` in minor units (positive = added,
 * negative = withdrawn/corrected); progress is just their sum.
 */

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number; // minor units, > 0
  targetDate: string | null; // YYYY-MM-DD
  isArchived: boolean;
}

export interface SavingsContribution {
  goalId: string;
  amount: number; // minor units, signed, non-zero
}

export interface GoalProgress {
  id: string;
  name: string;
  target: number;
  saved: number; // may be negative if over-withdrawn
  remaining: number; // max(0, target - saved)
  pct: number; // 0..100, integer
  complete: boolean;
  targetDate: string | null;
}

export interface GoalsSummary {
  totalTarget: number;
  totalSaved: number;
  activeCount: number;
  completeCount: number;
}

const clampPct = (n: number) => Math.max(0, Math.min(100, n));

/** Progress for one goal, given the full contribution list (filtered here). */
export function goalProgress(goal: SavingsGoal, contributions: SavingsContribution[]): GoalProgress {
  const saved = contributions.reduce((sum, c) => (c.goalId === goal.id ? sum + c.amount : sum), 0);
  const target = goal.targetAmount;
  const pct = target > 0 && saved > 0 ? clampPct(Math.round((saved / target) * 100)) : 0;
  return {
    id: goal.id,
    name: goal.name,
    target,
    saved,
    remaining: Math.max(0, target - saved),
    pct,
    complete: saved >= target,
    targetDate: goal.targetDate,
  };
}

/** Headline totals over the non-archived goals. */
export function goalsSummary(
  goals: SavingsGoal[],
  contributions: SavingsContribution[],
): GoalsSummary {
  const active = goals.filter((g) => !g.isArchived);
  let totalTarget = 0;
  let totalSaved = 0;
  let completeCount = 0;
  for (const g of active) {
    const { target, saved, complete } = goalProgress(g, contributions);
    totalTarget += target;
    totalSaved += saved;
    if (complete) completeCount += 1;
  }
  return { totalTarget, totalSaved, activeCount: active.length, completeCount };
}
