import { monthlyActuals } from "./actuals";
import { budgetVsActual } from "./budget-vs-actual";
import type { MonthKey } from "./month";
import { rollup } from "./rollup";
import { savingsRate } from "./savings-rate";
import type { BudgetCategory, BudgetState, BudgetTxn, CategoryBudget } from "./types";

export interface DashboardCategory extends BudgetCategory {
  name: string;
  color: string;
}

export interface DashboardBar {
  categoryId: string;
  name: string;
  color: string;
  budget: number;
  actual: number;
  remaining: number;
  pctUsed: number;
  state: BudgetState;
}

export interface DashboardTiles {
  income: number;
  /** All of the month's spending (budgeted or not, categorized or not): Money Left, Insights, the suggestions. */
  spent: number;
  netSavings: number;
  /** The month's budgets: the sum over the category cards that have one (`budget > 0`). */
  budgeted: number;
  /** Spending in the categories that have a budget: the Budgets hero's "spent of budgeted". */
  budgetedSpent: number;
  /** `spent − budgetedSpent`: spending in categories with no budget, uncategorized spending, and anything else no
   * budget card shows, so nothing spent leaves the Budgets page. */
  spentOutsideBudgets: number;
  /** `budgeted − budgetedSpent`, negative when over (the Budgets hero's "Remaining" / "Over by", Home's "left of your
   * budget"). Equals the sum of the budgeted cards' `remaining`, unclamped, so one over-budget card lowers it. */
  leftToSpend: number;
  /** Money Left ÷ Income; `null` when income is zero or negative — never a
   * bare `0` (design: 2026-09-13 Money Left / Savings Rate §8/§10). */
  savingsRate: number | null;
}

export interface DashboardView {
  tiles: DashboardTiles;
  bars: DashboardBar[];
}

const STATE_ORDER: Record<BudgetState, number> = { over: 0, near: 1, under: 2 };

/**
 * The whole dashboard view-model for a month: the headline tiles plus one bar
 * per expense category, sorted so over-budget then near-budget categories come
 * first. Composes `rollup`, `monthlyActuals` and `budgetVsActual`; the budget
 * tiles are sums over the bars that have a budget, so `budgetedSpent +
 * leftToSpend = budgeted` and `budgetedSpent + spentOutsideBudgets = spent`.
 */
export function buildDashboard(
  txns: BudgetTxn[],
  categories: DashboardCategory[],
  budgets: CategoryBudget[],
  month: MonthKey,
): DashboardView {
  const meta = new Map(categories.map((c) => [c.id, c]));
  const r = rollup(txns, categories, month);
  const rows = budgetVsActual(categories, budgets, monthlyActuals(txns, month));

  const bars: DashboardBar[] = rows
    .map((row) => {
      const c = meta.get(row.categoryId);
      return { ...row, name: c?.name ?? "", color: c?.color ?? "" };
    })
    .sort(
      (a, b) =>
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        b.pctUsed - a.pctUsed ||
        a.name.localeCompare(b.name),
    );

  let budgeted = 0;
  let budgetedSpent = 0;
  for (const b of bars) {
    if (b.budget <= 0) continue;
    budgeted += b.budget;
    budgetedSpent += b.actual;
  }

  return {
    tiles: {
      income: r.income,
      spent: r.spend,
      netSavings: r.net,
      budgeted,
      budgetedSpent,
      spentOutsideBudgets: r.spend - budgetedSpent,
      leftToSpend: budgeted - budgetedSpent,
      savingsRate: savingsRate(r.income, r.net),
    },
    bars,
  };
}
