/**
 * The native Home view-model — the explicit, versioned contract of `GET /api/mobile/home`. It is a projection of
 * `loadHome` (`src/lib/home/load-home.ts`, the same reads and money math the web Home renders): every number is copied from
 * its outputs, none is recomputed here, and no raw database row leaves the server. Money is integer minor units.
 *
 * "This month" and "today" are the user's own, from their stored time zone (`profiles.time_zone`), never the server's UTC
 * clock and never the device's guess: the app shows `month` and pre-fills new entries with `today`.
 *
 * Removing or changing a field is a contract change: bump `MOBILE_HOME_VERSION`, update `mobile/lib/home/contract.ts`,
 * and update the shape test. Adding a field keeps the version (an older app ignores what it does not read); the shape test
 * still lists it. Added 2026-09-29 (Stage 2B): the spending cards (`suggestion`, `breakdown`, `trend`, `trendChange`) and
 * `bankConnected`, so the native Home can show everything the web Home does. Added 2026-09-30 (Phase 3): `expenseCategories`
 * (Home's chips and set-up count, so the app needs no second request).
 */
import type { BudgetState } from "@/lib/budget/types";
import type { HomeData, HomeRecentItem } from "@/lib/home/load-home";
import { spendingCards, type MobileSpendingCards } from "@/lib/mobile/insights";

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

export type MobileHome = MobileSpendingCards & {
  version: typeof MOBILE_HOME_VERSION;
  /** `YYYY-MM`, the user's current month in their own time zone. */
  month: string;
  /** `YYYY-MM-DD`, the user's today in their own time zone (the default date for a new entry). */
  today: string;
  currency: string;
  /** Income minus spending for the month (`tiles.netSavings`). */
  moneyLeft: number;
  income: number;
  /** All of the month's spending (`tiles.spent`); Money Left is `income − spent`. */
  spent: number;
  budgeted: number;
  /** "Where it went"'s "left of your budget": `budgeted` minus spending in budgeted categories (`tiles.leftToSpend`). */
  leftToSpend: number;
  /** A fraction (0.3 = 30%); `null` when there is no income — never a bare 0. */
  savingsRate: number | null;
  /** One per expense category, in the dashboard's own over → near → under order. */
  categories: MobileHomeCategory[];
  /** The five most recent transactions, newest first. */
  recent: HomeRecentItem[];
  /** `null` when the user has no active goals. */
  savings: { activeCount: number; totalSaved: number; totalTarget: number } | null;
  /** "Get set up": whether any bank connection exists; `null` when bank connections are switched off. */
  bankConnected: boolean | null;
  /** The active expense categories, in the web Home's order: "Where it went"'s chips and "Get set up"'s count. */
  expenseCategories: { id: string; name: string }[];
};

export function mobileCategories(home: { view: Pick<HomeData["view"], "bars"> }): MobileHomeCategory[] {
  return home.view.bars.map((b) => ({
    id: b.categoryId,
    name: b.name,
    color: b.color,
    budget: b.budget,
    actual: b.actual,
    remaining: b.remaining,
    pctUsed: b.pctUsed,
    state: b.state,
  }));
}

export function buildMobileHome(home: HomeData): MobileHome {
  const { tiles } = home.view;
  const { savings } = home;

  return {
    version: MOBILE_HOME_VERSION,
    month: home.month,
    today: home.defaultDate,
    currency: home.currency,
    moneyLeft: tiles.netSavings,
    income: tiles.income,
    spent: tiles.spent,
    budgeted: tiles.budgeted,
    leftToSpend: tiles.leftToSpend,
    savingsRate: tiles.savingsRate,
    categories: mobileCategories(home),
    recent: home.recent.map((r) => ({
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
        ? { activeCount: savings.activeCount, totalSaved: savings.totalSaved, totalTarget: savings.totalTarget }
        : null,
    bankConnected: home.bankConnected,
    expenseCategories: home.categories.filter((c) => c.kind === "expense").map((c) => ({ id: c.id, name: c.name })),
    ...spendingCards(home.view, home.prevView, home.trend),
  };
}
