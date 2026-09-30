import { int, list, num, obj, str } from "../api/parse";
import { parseSuggestion, type BudgetSuggestion } from "../budgets/budgets-api";

/**
 * The response contract of `GET /api/mobile/insights?month=` (server: `buildMobileInsights` in `src/lib/mobile/insights.ts`,
 * over the same `loadInsights` the web Insights page renders). Every figure, share and change is computed server-side;
 * the app does no financial calculation. Money is integer minor units.
 */
export type MobileInsights = {
  month: string;
  currency: string;
  /** income minus spending (`tiles.netSavings`) */
  moneyLeft: number;
  income: number;
  spent: number;
  /** a fraction (0.3 = 30%); null with no income */
  savingsRate: number | null;
  /** whole points against last month; null when either month had no income */
  savingsRateDelta: number | null;
  /** largest first, whole-percent shares adding up to 100 */
  incomeSources: { name: string; color: string; amount: number; share: number }[];
  suggestion: BudgetSuggestion | null;
  /** "Where your money goes", largest first (the charts, F7) */
  breakdown: { name: string; amount: number; share: number }[];
  /** six months of spending, oldest first (the charts, F7) */
  trend: { month: string; spend: number }[];
  trendChange: { total: number; delta: number | null; previousMonth: string | null };
};

const orNull = <T>(v: unknown, read: (x: unknown) => T): T | null => (v === null || v === undefined ? null : read(v));

export function parseInsights(body: unknown): MobileInsights {
  const b = obj(body, "insights");
  const tc = obj(b.trendChange, "trendChange");
  return {
    month: str(b.month, "month"),
    currency: str(b.currency, "currency"),
    moneyLeft: int(b.moneyLeft, "moneyLeft"),
    income: int(b.income, "income"),
    spent: int(b.spent, "spent"),
    savingsRate: orNull(b.savingsRate, (v) => num(v, "savingsRate")),
    savingsRateDelta: orNull(b.savingsRateDelta, (v) => num(v, "savingsRateDelta")),
    incomeSources: list(b.incomeSources, "incomeSources", (v, i) => {
      const s = obj(v, `incomeSources[${i}]`);
      return { name: str(s.name, "name"), color: str(s.color, "color"), amount: int(s.amount, "amount"), share: num(s.share, "share") };
    }),
    suggestion: parseSuggestion(b.suggestion ?? null),
    breakdown: list(b.breakdown, "breakdown", (v, i) => {
      const s = obj(v, `breakdown[${i}]`);
      return { name: str(s.name, "name"), amount: int(s.amount, "amount"), share: num(s.share, "share") };
    }),
    trend: list(b.trend, "trend", (v, i) => {
      const t = obj(v, `trend[${i}]`);
      return { month: str(t.month, "month"), spend: int(t.spend, "spend") };
    }),
    trendChange: {
      total: int(tc.total, "trendChange.total"),
      delta: orNull(tc.delta, (v) => int(v, "trendChange.delta")),
      previousMonth: orNull(tc.previousMonth, (v) => str(v, "trendChange.previousMonth")),
    },
  };
}
