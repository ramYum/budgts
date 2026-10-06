import { monthKey, type MonthKey } from "./month";
import type { BudgetTxn, TxnStatus } from "./types";

/**
 * A held row (`pending_review`) is shown in Activity but counts toward no total until it is released
 * (`countsForMonth` gates on `confirmed`). The screens that list rows or show totals say so, so a held row never
 * looks counted while a total silently leaves it out (CLAUDE.md "No silent failure states").
 */
export function isHeld(status: TxnStatus): boolean {
  return status === "pending_review";
}

/**
 * How many of `month`'s rows the month's totals leave out only because they are held: the number Home names beside
 * its figures. A held confirmed-duplicate or a held row on an excluded account is not counted here, because releasing
 * it would still add nothing to a total.
 */
export function heldCount(txns: BudgetTxn[], month: MonthKey): number {
  let n = 0;
  for (const t of txns) {
    if (monthKey(t.occurredAt) !== month) continue;
    if (!isHeld(t.status) || t.duplicateOfId != null || t.accountExcluded) continue;
    n++;
  }
  return n;
}
