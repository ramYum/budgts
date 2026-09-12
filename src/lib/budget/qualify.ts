import { monthKey, type MonthKey } from "./month";
import type { BudgetTxn } from "./types";

/**
 * Whether a transaction counts toward a month's spend/income math: it must be
 * `confirmed`, not a transfer, not a confirmed duplicate, and have occurred in
 * `month` (UTC).
 *
 * INVARIANT (design: 2026-09-12 Phase 15): this is the single financial-metric
 * choke point. Every module that computes a dollar total from transactions —
 * rollup, actuals, budget-vs-actual, the dashboard tiles, and anything built
 * on them later (pacing, savings-rate/insights, etc.) — MUST route through
 * this function rather than re-deriving its own qualifying condition. A
 * transaction with `duplicateOfId` set must contribute to zero financial
 * aggregates, exactly like a transfer or a non-`confirmed` row does today.
 * Consumers that read transactions for a NON-financial purpose (e.g. the
 * "needs a category" queue) do not go through this function and must
 * explicitly check `duplicateOfId` themselves.
 */
export function countsForMonth(txn: BudgetTxn, month: MonthKey): boolean {
  return (
    !txn.isTransfer &&
    txn.duplicateOfId == null &&
    txn.status === "confirmed" &&
    monthKey(txn.occurredAt) === month
  );
}
