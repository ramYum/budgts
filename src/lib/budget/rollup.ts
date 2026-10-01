import { isEventRole } from "@/lib/plaid/event-role";
import { budgetEffectOf } from "./budget-effect";
import type { MonthKey } from "./month";
import { countsForMonth } from "./qualify";
import type { BudgetCategory, BudgetTxn, MonthRollup } from "./types";

/**
 * Month totals for the dashboard. Ignores transfers and non-`confirmed` rows.
 * `net` is Money Left — income minus spending for eligible transactions this
 * month, never a claim about account balances (design: 2026-09-13 Money
 * Left / Savings Rate §2/§3).
 *
 * - `spend` — net over `EXPENSE`/`EXPENSE_REVERSAL`-effect transactions when
 *   `eventRole` is resolved, or expense-category **and** uncategorized
 *   transactions when it is `null`/unrecognized (`debit − credit`); refunds
 *   reduce it either way.
 * - `income` — net over `INCOME`-effect transactions when `eventRole` is
 *   resolved, or income-category transactions when it is `null`/unrecognized
 *   (`credit − debit`).
 * - `net` — `income − spend`.
 *
 * The budget figures (budgeted, spent in budgeted categories, remaining) are
 * sums over the per-category bars, in `buildDashboard`.
 */
export function rollup(
  txns: BudgetTxn[],
  categories: BudgetCategory[],
  month: MonthKey,
): MonthRollup {
  const kindById = new Map(categories.map((c) => [c.id, c.kind]));

  let spend = 0;
  let income = 0;

  for (const t of txns) {
    if (!countsForMonth(t, month)) continue;

    const net = t.direction === "debit" ? t.amount : -t.amount;

    if (t.eventRole != null && isEventRole(t.eventRole)) {
      // countsForMonth already excluded NONE/UNKNOWN effects (TRANSFER,
      // CARD_PAYMENT, CASH_ADVANCE, ADJUSTMENT) before this row was ever
      // reached, so budgetEffectOf is guaranteed EXPENSE, EXPENSE_REVERSAL,
      // or INCOME here.
      if (budgetEffectOf(t.eventRole, t.direction) === "INCOME") {
        income -= net; // credit increases income
      } else {
        spend += net;
      }
      continue;
    }

    // Legacy fallback: unresolved/unrecognized role — category.kind + direction.
    if (t.categoryId !== null && kindById.get(t.categoryId) === "income") {
      income -= net; // credit increases income
    } else {
      spend += net;
    }
  }

  return { income, spend, net: income - spend };
}
