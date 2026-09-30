import type { Href } from "expo-router";

/**
 * The Budgets route's params, read exactly as the web Budgets page reads them (src/app/(app)/(dashboard)/budgets/page.tsx):
 * - `m`: `YYYY-MM`; anything else means the user's current month;
 * - `range`: `all` for All time; anything else is This month;
 * - `edit`: a category id (uuid) whose sheet opens straight in "Monthly budget" edit mode (Home's "Set budget"). Only in
 *   This month, as on the web, where the All time view takes no `edit`.
 * Links: `/budgets?m=<month>&edit=<categoryId>` (Home, Lane B); "See transactions" → `/activity?m=<month>&category=<id>`
 * (the web's `/transactions?m=…&category=…`, Activity, Lane D-1).
 */
const MONTH_RE = /^\d{4}-\d{2}$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

export type BudgetsParams = { month: string; range: "month" | "all"; edit: string | null };

export function readBudgetsParams(p: { m?: string | string[]; range?: string | string[]; edit?: string | string[] }, currentMonth: string): BudgetsParams {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const m = one(p.m);
  const range = one(p.range) === "all" ? "all" : "month";
  const edit = one(p.edit);
  return {
    month: m && MONTH_RE.test(m) ? m : currentMonth,
    range,
    edit: range === "month" && edit && UUID_RE.test(edit) ? edit : null,
  };
}

export const budgetsLink = {
  /** Home's "Set budget": the month's Budgets with that category's budget open for editing. */
  edit: (month: string, categoryId: string): Href => ({ pathname: "/budgets", params: { m: month, edit: categoryId } }),
  /** The category sheet's "See transactions": that month's Activity filtered to the category. */
  activity: (month: string, categoryId: string): Href => ({ pathname: "/activity", params: { m: month, category: categoryId } }),
};
