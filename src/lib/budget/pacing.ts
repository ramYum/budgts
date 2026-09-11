import { NEAR_THRESHOLD } from "./budget-vs-actual";
import { monthKey, type MonthKey } from "./month";
import { rollup } from "./rollup";
import type { BudgetCategory, BudgetTxn, CategoryBudget } from "./types";

/** Where a "spend so far" number sits against the straight-line budget burn. */
export type PaceState = "none" | "under" | "on" | "over";

export interface Pacing {
  month: MonthKey;
  isCurrentMonth: boolean;
  daysInMonth: number;
  /** Whole days completed before today. `daysInMonth` for a past month, 0 for a future one. */
  daysElapsed: number;
  /** Days left to spend, counting today. 0 for a past month. */
  daysRemaining: number;
  /** The real budget — sum of the month's category budget rows. The source of truth. */
  monthlyBudget: number;
  /** Net expense + uncategorized spend for the month (transfers / unconfirmed excluded). */
  spentToDate: number;
  /** Budgeted minus expense-category actuals — the same figure the dashboard shows as "left to spend". May be negative. */
  remainingBudget: number;
  /** Straight-line target spend by the end of today. `monthlyBudget` once the month is over. */
  expectedToDate: number;
  /** `spentToDate - expectedToDate`. Positive means spending faster than the straight line. */
  paceDelta: number;
  /** `remainingBudget` spread evenly over `daysRemaining`. 0 when nothing (or no day) is left. */
  dailyAllowance: number;
  /** The daily allowance across the next 7 days (fewer when the month ends sooner). */
  weeklyAllowance: number;
  pace: PaceState;
}

/** Calendar days in a `YYYY-MM` month, in UTC (leap-year safe). */
function daysInMonthOf(month: MonthKey): number {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

function paceState(monthlyBudget: number, spentToDate: number, expectedToDate: number): PaceState {
  if (monthlyBudget === 0) return "none";
  if (expectedToDate === 0) return spentToDate > 0 ? "over" : "under";
  if (spentToDate > expectedToDate) return "over";
  if (spentToDate >= (expectedToDate * NEAR_THRESHOLD) / 100) return "on";
  return "under";
}

/**
 * Daily / weekly spending guidance derived from the monthly budget — not a
 * separate budget. Composes {@link rollup} for the month totals, then spreads
 * what's left with straight-line proration over the days remaining. Pure:
 * takes `today` as an argument, reads no clock.
 */
export function pacing(
  txns: BudgetTxn[],
  categories: BudgetCategory[],
  budgets: CategoryBudget[],
  month: MonthKey,
  today: Date,
): Pacing {
  const r = rollup(txns, categories, budgets, month);
  const daysInMonth = daysInMonthOf(month);

  const todayKey = monthKey(today);
  const isCurrentMonth = todayKey === month;
  const isPastMonth = month < todayKey;

  let daysElapsed: number;
  let daysRemaining: number;
  let expectedToDate: number;

  if (isCurrentMonth) {
    const dayOfMonth = today.getUTCDate();
    daysElapsed = dayOfMonth - 1;
    daysRemaining = daysInMonth - dayOfMonth + 1;
    expectedToDate = Math.round(
      (r.totalBudgeted * Math.min(dayOfMonth, daysInMonth)) / daysInMonth,
    );
  } else if (isPastMonth) {
    daysElapsed = daysInMonth;
    daysRemaining = 0;
    expectedToDate = r.totalBudgeted;
  } else {
    daysElapsed = 0;
    daysRemaining = daysInMonth;
    expectedToDate = 0;
  }

  const spendable = Math.max(0, r.totalRemaining);
  const dailyAllowance =
    daysRemaining > 0 ? Math.round(spendable / daysRemaining) : 0;
  const weeklyAllowance =
    daysRemaining > 0
      ? Math.round((spendable * Math.min(7, daysRemaining)) / daysRemaining)
      : 0;

  return {
    month,
    isCurrentMonth,
    daysInMonth,
    daysElapsed,
    daysRemaining,
    monthlyBudget: r.totalBudgeted,
    spentToDate: r.spend,
    remainingBudget: r.totalRemaining,
    expectedToDate,
    paceDelta: r.spend - expectedToDate,
    dailyAllowance,
    weeklyAllowance,
    pace: paceState(r.totalBudgeted, r.spend, expectedToDate),
  };
}
