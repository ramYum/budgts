import type { MonthKey } from "./month";
import { countsForMonth } from "./qualify";
import type { BudgetTxn } from "./types";

/**
 * Net spend per category for a month: `sum(debit) − sum(credit)`, over
 * confirmed, non-transfer transactions whose `occurredAt` falls in `month`.
 *
 * The map is keyed by `categoryId`; uncategorized transactions collect under
 * the `null` key. A category with more refunds than purchases has a negative
 * value.
 */
export function monthlyActuals(
  txns: BudgetTxn[],
  month: MonthKey,
): Map<string | null, number> {
  const byCategory = new Map<string | null, number>();

  for (const t of txns) {
    if (!countsForMonth(t, month)) continue;

    const delta = t.direction === "debit" ? t.amount : -t.amount;
    byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + delta);
  }

  return byCategory;
}
