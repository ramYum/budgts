import { rollup } from "./rollup";
import type { MonthKey } from "./month";
import type { BudgetCategory, BudgetTxn } from "./types";

/** `count` consecutive month keys ending at (and including) `end`, oldest
 * first — e.g. `priorMonths("2026-09", 6)` → `["2026-04", ..., "2026-09"]`. */
export function priorMonths(end: MonthKey, count: number): MonthKey[] {
  const [y, m] = end.split("-").map(Number);
  const months: MonthKey[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

export interface MonthSpend {
  month: MonthKey;
  spend: number;
}

/** One `rollup().spend` total per month — a small multi-month wrapper around
 * the same pure month math Home/Budgets/Insights already use, so a spending
 * trend can never disagree with any of them for the same month. */
export function spendTrend(
  txns: BudgetTxn[],
  categories: BudgetCategory[],
  months: MonthKey[],
): MonthSpend[] {
  return months.map((month) => ({
    month,
    spend: rollup(txns, categories, [], month).spend,
  }));
}
