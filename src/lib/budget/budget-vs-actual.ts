import type { BudgetCategory, BudgetState, CategoryBudget, CategoryBudgetActual } from "./types";

/** pctUsed at or above this (but not over budget) shows as "near". */
export const NEAR_THRESHOLD = 80;

function stateFor(actual: number, budget: number, pctUsed: number): BudgetState {
  if (actual > budget) return "over";
  if (pctUsed >= NEAR_THRESHOLD) return "near";
  return "under";
}

/**
 * Per-expense-category budget vs actual for a month. Income categories are
 * skipped; the uncategorized bucket never produces a row (it has no budget).
 * A category budgeted but unspent, and spent but unbudgeted, both appear.
 */
export function budgetVsActual(
  categories: BudgetCategory[],
  budgets: CategoryBudget[],
  actuals: Map<string | null, number>,
): CategoryBudgetActual[] {
  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, b.amount]));

  return categories
    .filter((c) => c.kind === "expense")
    .map((c) => {
      const budget = budgetByCategory.get(c.id) ?? 0;
      const actual = actuals.get(c.id) ?? 0;
      const pctUsed = budget > 0 ? (Math.max(0, actual) / budget) * 100 : 0;
      return {
        categoryId: c.id,
        budget,
        actual,
        remaining: budget - actual,
        pctUsed,
        state: stateFor(actual, budget, pctUsed),
      };
    });
}
