export type Direction = "debit" | "credit";
export type CategoryKind = "expense" | "income";
export type TxnStatus = "confirmed" | "pending_review";

/** The transaction fields the budget math needs — a subset of the DB row. */
export interface BudgetTxn {
  categoryId: string | null;
  amount: number; // minor units, always > 0
  direction: Direction;
  occurredAt: Date;
  status: TxnStatus;
  isTransfer: boolean;
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
