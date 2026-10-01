/**
 * The derived figures the spending cards print beside their charts: the breakdown's slices and whole-percent shares, the
 * trend's change against last month, and the savings rate's change in points. Pure functions over numbers the month's
 * rollup already produced (`DashboardBar`s, `MonthSpend`s, `savingsRate`); they compute no totals of their own.
 *
 * Moved verbatim out of `src/components/spending-overview.tsx` and `insights-view.tsx` (2026-09-29, Stage 2B) so the web
 * cards and the native API (`/api/mobile/home`, `/api/mobile/insights`) print the same numbers from one implementation.
 * Drawing (ring cells, lit segments, colours) stays in the components.
 */
import type { DashboardBar } from "@/lib/budget/dashboard";
import type { MonthSpend } from "@/lib/budget/spend-trend";

/** Whole-percent shares that add up to exactly 100 (largest remainder), so
 * the legend never reads 101%. */
export function sharesOf(amounts: number[]): number[] {
  const total = amounts.reduce((s, a) => s + a, 0);
  if (total <= 0) return amounts.map(() => 0);
  const raw = amounts.map((a) => (a / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((s, f) => s + f, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]! += 1;
    left -= 1;
  }
  return floors;
}

// Grouping (unchanged): known categories in a fixed order, then up to two
// custom ones, then the uncategorized remainder as "Other".
const CHART_ORDER = ["Transportation", "Personal Care", "Food / Groceries", "Insurances", "Entertainment", "Housing"];
const CUSTOM_SLOTS = 2;

/** How many slices the breakdown shows before folding the rest into "Other" (the card's colour ramp has this many). */
export const BREAKDOWN_SLICES = 5;

export type BreakdownSlice = {
  name: string;
  amount: number;
  /** whole percent of the month's spending; the slices add up to exactly 100 */
  share: number;
};

/**
 * "Where your money goes": the slices the breakdown ring and legend show, largest first (the first one is the highlighted
 * slice). Every slice when there are five or fewer, else the four largest named slices and everything else as "Other".
 * Empty when nothing was spent.
 */
export function spendingBreakdown(bars: DashboardBar[], totalSpent: number): BreakdownSlice[] {
  const known = CHART_ORDER.map((name) => bars.find((b) => b.name === name))
    .filter((b): b is DashboardBar => !!b && b.actual > 0)
    .map((b) => ({ name: b.name, amount: b.actual }));

  const knownNames = new Set(known.map((k) => k.name));
  const custom = bars
    .filter((b) => b.actual > 0 && !knownNames.has(b.name))
    .sort((a, b) => b.actual - a.actual)
    .slice(0, CUSTOM_SLOTS)
    .map((b) => ({ name: b.name, amount: b.actual }));

  const categorized = known.reduce((sum, s) => sum + s.amount, 0) + custom.reduce((sum, s) => sum + s.amount, 0);
  const other = Math.max(0, totalSpent - categorized);

  const grouped = [...known, ...custom, ...(other > 0 ? [{ name: "Other", amount: other }] : [])];

  if (grouped.length === 0 || totalSpent <= 0) {
    return [];
  }

  // Display: every slice when there are five or fewer, else the four largest
  // named slices and everything else as "Other".
  const byAmount = [...grouped].sort((a, b) => b.amount - a.amount);
  const fits = grouped.length <= BREAKDOWN_SLICES;
  const top = fits ? byAmount : byAmount.filter((s) => s.name !== "Other").slice(0, 4);
  const rest = totalSpent - top.reduce((sum, s) => sum + s.amount, 0);
  const list = [...top, ...(!fits && rest > 0 ? [{ name: "Other", amount: rest }] : [])];
  const shares = sharesOf(list.map((s) => s.amount));
  return list.map((s, i) => ({ ...s, share: shares[i]! }));
}

/** The trend card's headline: this month's spending and its change against last month (null with one month). */
export function trendChange(trend: MonthSpend[]): { total: number; delta: number | null; previousMonth: string | null } {
  const current = trend.at(-1);
  const previous = trend.at(-2);
  return {
    total: current?.spend ?? 0,
    delta: current && previous ? current.spend - previous.spend : null,
    previousMonth: previous?.month ?? null,
  };
}

/** The savings rate's change against last month in whole points; null when either month had no income. */
export function savingsRateDelta(current: number | null, previous: number | null): number | null {
  return current !== null && previous !== null ? Math.round((current - previous) * 100) : null;
}

/**
 * The Budgets hero's progress: the share of the month's budget already spent in budgeted categories (a percentage,
 * uncapped) and the bar's tone ("over" once that spending passes the budget, "near" from 85% spent). It reads
 * `budgetedSpent`, not total `spent`, so the bar agrees with "$X spent of $Y budgeted" and "Remaining"
 * (2026-10-01, the Budgets hero adds up). Moved from `src/components/budgets-view.tsx`.
 */
export function budgetProgress(tiles: { budgetedSpent: number; budgeted: number; leftToSpend: number }): {
  spentPct: number;
  tone: "over" | "near" | "under";
} {
  const spentPct = tiles.budgeted > 0 ? (tiles.budgetedSpent / tiles.budgeted) * 100 : 0;
  const tone = tiles.leftToSpend < 0 ? "over" : spentPct >= 85 ? "near" : "under";
  return { spentPct, tone };
}
