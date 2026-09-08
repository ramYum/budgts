import { monthlyActuals } from "./actuals";
import { budgetVsActual } from "./budget-vs-actual";
import type { MonthKey } from "./month";
import { rollup } from "./rollup";
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
  spent: number;
  netSavings: number;
  budgeted: number;
  leftToSpend: number;
}

export interface DashboardView {
  tiles: DashboardTiles;
  bars: DashboardBar[];
}

const STATE_ORDER: Record<BudgetState, number> = { over: 0, near: 1, under: 2 };

/**
 * The whole dashboard view-model for a month: five headline tiles plus one bar
 * per expense category, sorted so over-budget then near-budget categories come
 * first. Composes `rollup`, `monthlyActuals` and `budgetVsActual` — no new math.
 */
export function buildDashboard(
  txns: BudgetTxn[],
  categories: DashboardCategory[],
  budgets: CategoryBudget[],
  month: MonthKey,
): DashboardView {
  const meta = new Map(categories.map((c) => [c.id, c]));
  const r = rollup(txns, categories, budgets, month);
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

  return {
    tiles: {
      income: r.income,
      spent: r.spend,
      netSavings: r.net,
      budgeted: r.totalBudgeted,
      leftToSpend: r.totalRemaining,
    },
    bars,
  };
}
