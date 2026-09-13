import { isEventRole } from "@/lib/plaid/event-role";
import { budgetEffectOf } from "./budget-effect";
import { monthKey, type MonthKey } from "./month";
import type { BudgetTxn } from "./types";

/**
 * Whether a transaction counts toward a month's spend/income math: it must be
 * `confirmed`, not a confirmed duplicate, have occurred in `month` (UTC), and
 * then either (a) have a *recognized* `eventRole`, in which case its
 * `budgetEffectOf` decides — `EXPENSE`/`EXPENSE_REVERSAL`/`INCOME` qualify,
 * `NONE`/`UNKNOWN` don't — or (b) fall back to the legacy `!isTransfer` check
 * when `eventRole` is `null` (manual/email/receipt rows, any Plaid-sourced
 * row the resolver left unresolved) **or unrecognized** (a value outside the
 * defined role set — never guess which role it meant; treat it exactly like
 * unresolved rather than silently excluding it, design: 2026-09-12
 * qualify-integration final review, Important #2).
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
 *
 * INVARIANT (design: 2026-09-12 qualify-integration): `status` and
 * `duplicateOfId` gate unconditionally, before the role/effect branch is
 * ever reached — a `pending_review` or confirmed-duplicate row is excluded
 * regardless of what its event role or budget effect would say. Once a
 * role resolves, `is_transfer` is never consulted for that row.
 */
export function countsForMonth(txn: BudgetTxn, month: MonthKey): boolean {
  if (monthKey(txn.occurredAt) !== month) return false;
  if (txn.status !== "confirmed") return false;
  if (txn.duplicateOfId != null) return false;

  if (txn.eventRole != null && isEventRole(txn.eventRole)) {
    const effect = budgetEffectOf(txn.eventRole, txn.direction);
    return effect === "EXPENSE" || effect === "EXPENSE_REVERSAL" || effect === "INCOME";
  }
  return !txn.isTransfer;
}
