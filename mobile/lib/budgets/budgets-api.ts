import { int, list, num, obj, oneOf, str } from "../api/parse";

/**
 * The response contract of `GET /api/mobile/budgets?month=` (server: `buildMobileBudgets` in `src/lib/mobile/reads.ts`). Every
 * number is computed server-side by the same dashboard math Home uses; the app does no financial calculation. Money is integer
 * minor units. Unknown extra fields are ignored.
 */
export type BudgetState = "under" | "near" | "over";

export type MobileBudgetCategory = {
  id: string;
  name: string;
  color: string;
  budget: number;
  actual: number;
  remaining: number;
  /** A fraction (0.3 = 30%). */
  pctUsed: number;
  state: BudgetState;
};

export type MobileBudgets = {
  month: string;
  currency: string;
  budgeted: number;
  spent: number;
  leftToSpend: number;
  categories: MobileBudgetCategory[];
};

export function parseBudgets(body: unknown): MobileBudgets {
  const b = obj(body, "budgets");
  return {
    month: str(b.month, "month"),
    currency: str(b.currency, "currency"),
    budgeted: int(b.budgeted, "budgeted"),
    spent: int(b.spent, "spent"),
    leftToSpend: int(b.leftToSpend, "leftToSpend"),
    categories: list(b.categories, "categories", (v, i) => {
      const c = obj(v, `categories[${i}]`);
      return {
        id: str(c.id, "id"),
        name: str(c.name, "name"),
        color: str(c.color, "color"),
        budget: int(c.budget, "budget"),
        actual: int(c.actual, "actual"),
        remaining: int(c.remaining, "remaining"),
        pctUsed: num(c.pctUsed, "pctUsed"),
        state: oneOf(c.state, "state", ["under", "near", "over"] as const),
      };
    }),
  };
}
