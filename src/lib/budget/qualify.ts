import { monthKey, type MonthKey } from "./month";
import type { BudgetTxn } from "./types";

/**
 * Whether a transaction counts toward a month's spend/income math: it must be
 * `confirmed`, not a transfer, and have occurred in `month` (UTC).
 */
export function countsForMonth(txn: BudgetTxn, month: MonthKey): boolean {
  return !txn.isTransfer && txn.status === "confirmed" && monthKey(txn.occurredAt) === month;
}
