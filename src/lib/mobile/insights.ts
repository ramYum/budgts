/**
 * The native Insights view-model: the contract of `GET /api/mobile/insights`. A projection of `loadInsights`
 * (`src/lib/insights/load-insights.ts`, the reads and money math the web Insights page renders). Every figure is copied from
 * its outputs or from the same shared figure functions the web cards call (`pickSuggestion`,
 * `src/lib/insights/figures.ts`); none is recomputed here, and no raw row leaves the server. Money is integer minor units.
 *
 * Also exports the spending-card projections Home shares (`spendingCards`), so both screens print identical figures.
 */
import type { DashboardView } from "@/lib/budget/dashboard";
import type { MonthSpend } from "@/lib/budget/spend-trend";
import { savingsRateDelta, sharesOf, spendingBreakdown, trendChange, type BreakdownSlice } from "@/lib/insights/figures";
import type { InsightsData } from "@/lib/insights/load-insights";
import { pickSuggestion, type Suggestion } from "@/lib/insights/suggestion";
import { MOBILE_API_VERSION } from "@/lib/mobile/reads";

export type MobileSpendingCards = {
  /** The one change worth suggesting this month (Home's "What can I change?", Insights' "Where you could save"). */
  suggestion: Suggestion | null;
  /** "Where your money goes", largest first; the first slice is the highlighted one. Empty when nothing was spent. */
  breakdown: BreakdownSlice[];
  /** Six months of spending, oldest first; the last entry is the shown month. */
  trend: MonthSpend[];
  /** The trend card's headline: the month's spending and its change against the previous month. */
  trendChange: { total: number; delta: number | null; previousMonth: string | null };
};

export function spendingCards(view: DashboardView, prevView: DashboardView, trend: MonthSpend[]): MobileSpendingCards {
  return {
    suggestion: pickSuggestion(view.bars, prevView.bars, view.tiles.spent),
    breakdown: spendingBreakdown(view.bars, view.tiles.spent),
    trend: trend.map((t) => ({ month: t.month, spend: t.spend })),
    trendChange: trendChange(trend),
  };
}

export type MobileIncomeSource = { name: string; color: string; amount: number; share: number };

export type MobileInsights = MobileSpendingCards & {
  version: typeof MOBILE_API_VERSION;
  /** `YYYY-MM`. */
  month: string;
  currency: string;
  /** Income minus spending for the month (`tiles.netSavings`). */
  moneyLeft: number;
  income: number;
  spent: number;
  /** A fraction (0.3 = 30%); null when there is no income. */
  savingsRate: number | null;
  previousSavingsRate: number | null;
  /** Whole points against last month; null when either month had no income. */
  savingsRateDelta: number | null;
  /** The month's income by category, largest first, with whole-percent shares adding up to 100. */
  incomeSources: MobileIncomeSource[];
};

export function buildMobileInsights(data: InsightsData): MobileInsights {
  const { tiles } = data.current;
  const shares = sharesOf(data.incomeSources.map((s) => s.amount));
  return {
    version: MOBILE_API_VERSION,
    month: data.month,
    currency: data.currency,
    moneyLeft: tiles.netSavings,
    income: tiles.income,
    spent: tiles.spent,
    savingsRate: tiles.savingsRate,
    previousSavingsRate: data.previous.tiles.savingsRate,
    savingsRateDelta: savingsRateDelta(tiles.savingsRate, data.previous.tiles.savingsRate),
    incomeSources: data.incomeSources.map((s, i) => ({ name: s.name, color: s.color, amount: s.amount, share: shares[i]! })),
    ...spendingCards(data.current, data.previous, data.trend),
  };
}
