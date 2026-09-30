import { int, list, num, obj, oneOf, str } from "../api/parse";

/**
 * The response contract of `GET /api/mobile/budgets?month=&range=` (server: `buildMobileBudgets` /
 * `buildMobileBudgetsAllTime` in `src/lib/mobile/reads.ts`, over the same `loadBudgets` the web Budgets page renders).
 * Every number, the hero's share and tone, and the unplanned note are computed server-side; the app does no financial
 * calculation. Money is integer minor units. Unknown extra fields are ignored.
 */
export type BudgetState = "under" | "near" | "over";

export type MobileBudgetCategory = {
  id: string;
  name: string;
  color: string;
  budget: number;
  actual: number;
  /** budget − actual; negative when over. */
  remaining: number;
  /** A percentage of the budget spent (30 = 30%), uncapped; 0 when no budget is set. */
  pctUsed: number;
  state: BudgetState;
  /** What the category spent last month (the detail sheet's comparison); 0 when nothing. */
  previousActual: number;
};

/** The one change worth suggesting this month (server `pickSuggestion`); Budgets shows the `unbudgeted` kind. */
export type BudgetSuggestion =
  | { kind: "unbudgeted"; categoryId: string; name: string; amount: number; share: number }
  | { kind: "mover"; categoryId: string; name: string; amount: number; delta: number };

export type MobileBudgetsMonth = {
  range: "month";
  month: string;
  currency: string;
  budgeted: number;
  spent: number;
  leftToSpend: number;
  /** The hero bar's share of the budget spent, a percentage (uncapped), and its tone. */
  spentPct: number;
  tone: BudgetState;
  suggestion: BudgetSuggestion | null;
  categories: MobileBudgetCategory[];
  /** Expense categories with no budget yet (what "New budget" offers). */
  unbudgetedCategories: { id: string; name: string; color: string }[];
};

export type MobileBudgetsAllTime = {
  range: "all";
  month: string;
  currency: string;
  /** Every expense category's all-time spending, largest first. */
  allTime: { categoryId: string; name: string; color: string; total: number }[];
};

export type MobileBudgets = MobileBudgetsMonth | MobileBudgetsAllTime;

/** The server's `Suggestion` (src/lib/insights/suggestion.ts), shared by Budgets and Insights. */
export function parseSuggestion(v: unknown): BudgetSuggestion | null {
  if (v === null) return null;
  const s = obj(v, "suggestion");
  const kind = oneOf(s.kind, "suggestion.kind", ["unbudgeted", "mover"] as const);
  const base = { categoryId: str(s.categoryId, "suggestion.categoryId"), name: str(s.name, "suggestion.name"), amount: int(s.amount, "suggestion.amount") };
  return kind === "unbudgeted"
    ? { kind, ...base, share: num(s.share, "suggestion.share") }
    : { kind, ...base, delta: int(s.delta, "suggestion.delta") };
}

export function parseBudgets(body: unknown): MobileBudgets {
  const b = obj(body, "budgets");
  const range = oneOf(b.range, "range", ["month", "all"] as const);
  const month = str(b.month, "month");
  const currency = str(b.currency, "currency");
  if (range === "all") {
    return {
      range,
      month,
      currency,
      allTime: list(b.allTime, "allTime", (v, i) => {
        const r = obj(v, `allTime[${i}]`);
        return { categoryId: str(r.categoryId, "categoryId"), name: str(r.name, "name"), color: str(r.color, "color"), total: int(r.total, "total") };
      }),
    };
  }
  return {
    range,
    month,
    currency,
    budgeted: int(b.budgeted, "budgeted"),
    spent: int(b.spent, "spent"),
    leftToSpend: int(b.leftToSpend, "leftToSpend"),
    spentPct: num(b.spentPct, "spentPct"),
    tone: oneOf(b.tone, "tone", ["under", "near", "over"] as const),
    suggestion: parseSuggestion(b.suggestion ?? null),
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
        previousActual: int(c.previousActual, "previousActual"),
      };
    }),
    unbudgetedCategories: list(b.unbudgetedCategories, "unbudgetedCategories", (v, i) => {
      const c = obj(v, `unbudgetedCategories[${i}]`);
      return { id: str(c.id, "id"), name: str(c.name, "name"), color: str(c.color, "color") };
    }),
  };
}
