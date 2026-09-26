import type { DashboardBar } from "@/lib/budget/dashboard";

/** The one change worth suggesting this month ("What can I change?" on Home,
 * "Where you could save" on Insights, the unplanned note on Budgets). */
export type Suggestion =
  | {
      /** spending with no plan behind it: give it a budget */
      kind: "unbudgeted";
      categoryId: string;
      name: string;
      amount: number;
      /** its whole-percent share of the month's spending */
      share: number;
    }
  | {
      /** the category that grew most against last month */
      kind: "mover";
      categoryId: string;
      name: string;
      amount: number;
      delta: number;
    };

/**
 * Picks from figures the month's rollup already produced (`bars`, last
 * month's `prevBars`, the month's `totalSpent`); it computes no totals of its
 * own. Unplanned spending comes first, since a budget is the fix the app can
 * offer; failing that, the category that grew most. Null when neither applies.
 */
export function pickSuggestion(
  bars: DashboardBar[],
  prevBars: DashboardBar[],
  totalSpent: number,
): Suggestion | null {
  const unbudgeted = bars
    .filter((b) => b.budget <= 0 && b.actual > 0)
    .sort((a, b) => b.actual - a.actual)[0];
  if (unbudgeted && totalSpent > 0) {
    return {
      kind: "unbudgeted",
      categoryId: unbudgeted.categoryId,
      name: unbudgeted.name,
      amount: unbudgeted.actual,
      share: Math.round((unbudgeted.actual / totalSpent) * 100),
    };
  }

  const mover = bars
    .filter((b) => b.actual > 0)
    .map((b) => ({ b, delta: b.actual - (prevBars.find((p) => p.categoryId === b.categoryId)?.actual ?? 0) }))
    .sort((x, y) => y.delta - x.delta)[0];
  if (mover && mover.delta > 0) {
    return { kind: "mover", categoryId: mover.b.categoryId, name: mover.b.name, amount: mover.b.actual, delta: mover.delta };
  }
  return null;
}
