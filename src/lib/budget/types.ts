import type { EventRole } from "@/lib/plaid/types";

export type Direction = "debit" | "credit";
export type CategoryKind = "expense" | "income";
export type BudgetEffect = "EXPENSE" | "INCOME" | "EXPENSE_REVERSAL" | "NONE" | "UNKNOWN";
export type TxnStatus = "confirmed" | "pending_review";

/** The transaction fields the budget math needs — a subset of the DB row. */
export interface BudgetTxn {
  categoryId: string | null;
  amount: number; // minor units, always > 0
  direction: Direction;
  occurredAt: Date;
  status: TxnStatus;
  isTransfer: boolean;
  /**
   * Set only by a one-time, human-reviewed remediation (design: 2026-09-12
   * Phase 15) — never by sync, never automatically. Non-null means "a
   * confirmed duplicate of another row"; countsForMonth excludes it.
   */
  duplicateOfId: string | null;
  /**
   * Resolved by the Event Role classifier (design: 2026-09-12 Budget Effect
   * / Qualify integration) — never set by manual/email/receipt ingestion,
   * which always leaves this `null`. Non-null drives `countsForMonth` via
   * `budgetEffectOf`; `null` falls back to the legacy `!isTransfer` check.
   */
  eventRole: EventRole | null;
  /**
   * True only when the user explicitly set `isTransfer` to a value that
   * differed from what was stored (design: 2026-09-12 transfer-ownership
   * §4) — never by sync. When true, `countsForMonth` lets the user's
   * decision (`!isTransfer`) outrank any machine-resolved `eventRole`.
   */
  transferUserSet: boolean;
}

export interface BudgetCategory {
  id: string;
  kind: CategoryKind;
}

export interface CategoryBudget {
  categoryId: string;
  amount: number; // minor units, >= 0
}

export type BudgetState = "under" | "near" | "over";

export interface CategoryBudgetActual {
  categoryId: string;
  budget: number; // minor units; 0 when no budget set
  actual: number; // net minor units; negative when refunds exceed spend
  remaining: number; // budget - actual
  pctUsed: number; // 0..∞; 0 when actual <= 0
  state: BudgetState;
}

export interface MonthRollup {
  income: number;
  spend: number;
  net: number; // income - spend
  totalBudgeted: number;
  totalRemaining: number;
}

/** The uncategorized bucket key used by monthlyActuals(). */
export const UNCATEGORIZED = null;
