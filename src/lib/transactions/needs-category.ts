/**
 * "Needs a category": imported bank rows with no category, inside the user's categorization window (the one prompt V1
 * shows for imported transactions; design §3, window: 2026-09-16 Advancial follow-up), and the header bell's count of
 * them. Both use `applyNeedsCategoryFilter`, so the list and the count can never drift.
 *
 * Shared by the web Activity page and dashboard layout and the native `GET /api/mobile/activity` / `GET /api/mobile/status`
 * (moved out of the page and layout, 2026-09-29, Stage 2B). Framework-free; the caller supplies the user's Supabase client
 * (RLS scopes every query) and `profiles.created_at` (the window's anchor).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { STANDARD_CATEGORIES } from "@/lib/categories/standard";
import { buildCategoryLookup, suggestPlaidCategory } from "@/lib/plaid/category-map";
import type { UncategorizedTxn } from "@/lib/plaid/group-uncategorized";
import { applyNeedsCategoryFilter } from "@/lib/plaid/needs-category-window";

/** The rows cap: a to-do list scoped to the window, grouped by merchant for the user, so this bounds raw rows. */
export const NEEDS_CATEGORY_LIMIT = 500;

/**
 * Newest first within the window. Each row carries Plaid's category hint resolved against the user's own categories
 * (`suggestPlaidCategory`): a suggestion, never auto-applied.
 */
export async function loadNeedsCategory(
  supabase: SupabaseClient,
  createdAt: string,
  categories: readonly { id: string; name: string }[],
): Promise<UncategorizedTxn[]> {
  const { data, error } = await applyNeedsCategoryFilter(
    supabase.from("transactions").select(
      "id, description, merchant_name, merchant_entity_id, amount, direction, occurred_at, pending, plaid_category_primary, plaid_category_detailed, account:accounts(name)",
    ),
    createdAt,
  )
    .order("occurred_at", { ascending: false })
    .limit(NEEDS_CATEGORY_LIMIT);
  if (error) throw new Error("needs_category_read_failed");

  const categoryLookup = buildCategoryLookup(categories.map((c) => [c.name, c.id] as const));
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const acc = r.account as { name: string | null } | { name: string | null }[] | null;
    const accountName = Array.isArray(acc) ? (acc[0]?.name ?? null) : (acc?.name ?? null);
    const primary = (r.plaid_category_primary as string | null) ?? null;
    const detailed = (r.plaid_category_detailed as string | null) ?? null;
    return {
      id: r.id as string,
      description: (r.description as string | null) ?? "",
      merchant_name: (r.merchant_name as string | null) ?? null,
      merchant_entity_id: (r.merchant_entity_id as string | null) ?? null,
      amount: r.amount as number,
      direction: r.direction as "debit" | "credit",
      occurred_at: r.occurred_at as string,
      account_name: accountName,
      pending: r.pending as boolean,
      plaid_category_primary: primary,
      suggested_category_id: suggestPlaidCategory(primary, detailed, categoryLookup),
    };
  });
}

/** The header bell: how many bank rows await a category (a head-only count, same predicate as the list). */
export async function needsCategoryCount(supabase: SupabaseClient, createdAt: string): Promise<number> {
  const { count } = await applyNeedsCategoryFilter(
    supabase.from("transactions").select("id", { count: "exact", head: true }),
    createdAt,
  );
  return count ?? 0;
}

/** Standard categories the user doesn't currently have: offered in the picker as "add this one" (created on pick). */
export function missingStandardCategories(categoryNames: readonly string[]): string[] {
  const have = new Set(categoryNames);
  return STANDARD_CATEGORIES.map((c) => c.name).filter((n) => !have.has(n));
}
