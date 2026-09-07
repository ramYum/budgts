import type { MonthKey } from "./month";
import { countsForMonth } from "./qualify";
import type { BudgetCategory, BudgetTxn, CategoryBudget, MonthRollup } from "./types";

/**
 * Month totals for the dashboard. Ignores transfers and non-`confirmed` rows.
 *
 * - `spend` — net over expense-category **and** uncategorized transactions
 *   (`debit − credit`); refunds reduce it.
 * - `income` — net over income-category transactions (`credit − debit`).
 * - `net` — `income − spend`.
 * - `totalBudgeted` — sum of the month's budget rows.
 * - `totalRemaining` — `totalBudgeted` minus expense-category actuals only, so
 *   it matches the sum of the per-category bars. Uncategorized spend shows in
 *   `spend` but is not charged against any budget.
 */
export function rollup(
  txns: BudgetTxn[],
  categories: BudgetCategory[],
  budgets: CategoryBudget[],
  month: MonthKey,
): MonthRollup {
  const kindById = new Map(categories.map((c) => [c.id, c.kind]));

  let spend = 0;
  let income = 0;
  let expenseActual = 0;

  for (const t of txns) {
    if (!countsForMonth(t, month)) continue;

    const net = t.direction === "debit" ? t.amount : -t.amount;
    if (t.categoryId !== null && kindById.get(t.categoryId) === "income") {
      income -= net; // credit increases income
    } else {
      spend += net;
      if (t.categoryId !== null && kindById.get(t.categoryId) === "expense") {
        expenseActual += net;
      }
    }
  }

  const totalBudgeted = budgets.reduce((sum, b) => sum + b.amount, 0);

  return {
    income,
    spend,
    net: income - spend,
    totalBudgeted,
    totalRemaining: totalBudgeted - expenseActual,
  };
}
