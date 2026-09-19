/**
 * The mobile Home view-model — the explicit, versioned contract of
 * `GET /api/mobile/home`. It is a projection of the authoritative dashboard
 * (`buildDashboard` tiles/bars, `goalsSummary`, the recent-activity query):
 * every number is copied from those outputs, none is recomputed here, and no
 * raw database row leaves the server. Money is integer minor units.
 *
 * Changing a field is a contract change: bump `MOBILE_HOME_VERSION`, update
 * `mobile/lib/home/contract.ts`, and update the shape test.
 */
import type { MonthlyDashboard, RecentActivity } from "@/lib/budget/home-data";
import type { BudgetState } from "@/lib/budget/types";

export const MOBILE_HOME_VERSION = 1;

export type MobileHomeCategory = {
  id: string;
  name: string;
  color: string;
  budget: number;
  actual: number;
  remaining: number;
  pctUsed: number;
  state: BudgetState;
};

export type MobileHome = {
  version: typeof MOBILE_HOME_VERSION;
  /** `YYYY-MM` (UTC). */
  month: string;
  currency: string;
  /** Income minus spending for the month (`tiles.netSavings`). */
  moneyLeft: number;
  income: number;
  spent: number;
  budgeted: number;
  leftToSpend: number;
  /** A fraction (0.3 = 30%); `null` when there is no income — never a bare 0. */
  savingsRate: number | null;
  /** One per expense category, in the dashboard's own over → near → under order. */
  categories: MobileHomeCategory[];
  /** The five most recent transactions, newest first. */
  recent: RecentActivity[];
  /** `null` when the user has no active goals. */
  savings: { activeCount: number; totalSaved: number; totalTarget: number } | null;
};

export function buildMobileHome({
  month,
  dash,
  recent,
}: {
  month: string;
  dash: MonthlyDashboard;
  recent: RecentActivity[];
}): MobileHome {
  const { tiles, bars } = dash.view;
  const { savings } = dash;

  return {
    version: MOBILE_HOME_VERSION,
    month,
    currency: dash.currency,
    moneyLeft: tiles.netSavings,
    income: tiles.income,
    spent: tiles.spent,
    budgeted: tiles.budgeted,
    leftToSpend: tiles.leftToSpend,
    savingsRate: tiles.savingsRate,
    categories: bars.map((b) => ({
      id: b.categoryId,
      name: b.name,
      color: b.color,
      budget: b.budget,
      actual: b.actual,
      remaining: b.remaining,
      pctUsed: b.pctUsed,
      state: b.state,
    })),
    recent: recent.map((r) => ({
      id: r.id,
      description: r.description,
      amount: r.amount,
      direction: r.direction,
      occurredAt: r.occurredAt,
      isTransfer: r.isTransfer,
      category: r.category,
    })),
    savings:
      savings.activeCount > 0
        ? {
            activeCount: savings.activeCount,
            totalSaved: savings.totalSaved,
            totalTarget: savings.totalTarget,
          }
        : null,
  };
}
