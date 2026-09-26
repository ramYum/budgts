/**
 * Budgts' standard category set — the 8 rows `handle_new_user()` seeds for every
 * account (migration `0002_category_set_v2.sql`). Name + kind + colour must
 * match that migration verbatim.
 *
 * Used by the "Needs a category" flow: if the user files a bank transaction
 * under a standard category they no longer have (archived, or removed), Budgts
 * re-adds it automatically rather than sending them to a setup screen.
 */
import type { CategoryKind } from "@/lib/categories/options";

export interface StandardCategory {
  name: string;
  kind: CategoryKind;
  color: string;
}

export const STANDARD_CATEGORIES: readonly StandardCategory[] = [
  { name: "Insurances", kind: "expense", color: "#14b8a6" },
  { name: "Personal Care", kind: "expense", color: "#ec4899" },
  { name: "Housing", kind: "expense", color: "#8b5cf6" },
  { name: "Entertainment", kind: "expense", color: "#f97316" },
  { name: "Transportation", kind: "expense", color: "#3b82f6" },
  { name: "Food / Groceries", kind: "expense", color: "#22c55e" },
  { name: "Salary", kind: "income", color: "#16a34a" },
  { name: "Other Income", kind: "income", color: "#65a30d" },
] as const;

export const STANDARD_CATEGORY_NAMES = STANDARD_CATEGORIES.map((c) => c.name) as [string, ...string[]];

export type StandardCategoryName = (typeof STANDARD_CATEGORIES)[number]["name"];

export function standardCategory(name: string): StandardCategory | undefined {
  return STANDARD_CATEGORIES.find((c) => c.name === name);
}
