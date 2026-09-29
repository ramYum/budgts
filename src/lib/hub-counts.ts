import "server-only";
import { currentMonthKey } from "@/lib/budget/month";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import type { SupabaseClient } from "@supabase/supabase-js";

export type HubCounts = {
  goals: number;
  accounts: number;
  /** connected banks; null when bank connections are switched off */
  banks: number | null;
  categories: number;
  /** categories with a budget this month */
  budgets: number;
};

/** The small counts the More and Settings hubs show beside each row ("2
 * goals", "1 bank"). Head-only counts under the user's own RLS, all at once:
 * no rows come back, just the numbers. Shared by the web hubs and the native
 * GET /api/mobile/hub (the caller's cookie or Bearer client). */
export async function hubCounts(supabase: SupabaseClient, timeZone: string): Promise<HubCounts> {
  const head = { count: "exact" as const, head: true };
  const [goals, accounts, banks, categories, budgets] = await Promise.all([
    supabase.from("savings_goals").select("id", head).eq("is_archived", false),
    supabase.from("accounts").select("id", head).eq("is_archived", false),
    plaidUiEnabled() ? supabase.from("plaid_items").select("id", head) : Promise.resolve({ count: null }),
    supabase.from("categories").select("id", head).eq("is_archived", false),
    supabase.from("budgets").select("id", head).eq("month", `${currentMonthKey(timeZone)}-01`).gt("amount", 0),
  ]);
  return {
    goals: goals.count ?? 0,
    accounts: accounts.count ?? 0,
    banks: plaidUiEnabled() ? (banks.count ?? 0) : null,
    categories: categories.count ?? 0,
    budgets: budgets.count ?? 0,
  };
}

/** "1 goal" / "2 goals". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
