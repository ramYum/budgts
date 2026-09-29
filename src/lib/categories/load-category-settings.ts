/**
 * Settings → Categories' data: every category (active and archived, by name) with how many of this month's transactions
 * sit in it (the rows Activity lists when you tap one). One implementation, used by the web page
 * (`src/app/(app)/(dashboard)/settings/categories/page.tsx`) and the native `GET /api/mobile/settings/categories`. Moved
 * verbatim out of the web page (2026-09-29, Stage 2B). "This month" is the user's own, from their time zone.
 *
 * Framework-free; the caller supplies the Supabase client (RLS scopes it to the user). A failed read throws: a category
 * list missing rows would hide categories the user can still restore.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentMonthKey } from "@/lib/budget/month";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

export type CategorySettingsItem = {
  id: string;
  name: string;
  kind: "expense" | "income";
  color: string;
  is_archived: boolean;
  /** This month's transactions in the category. */
  txnCount: number;
};

export type CategorySettings = { month: string; items: CategorySettingsItem[] };

export async function loadCategorySettings(
  supabase: SupabaseClient,
  input: { timeZone: string; plaidEnabled: boolean },
): Promise<CategorySettings> {
  const plaidOn = input.plaidEnabled;
  const month = currentMonthKey(input.timeZone);
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y!, m!, 1)).toISOString();

  type CategoryRow = Omit<CategorySettingsItem, "txnCount">;
  const [categories, monthRows] = await Promise.all([
    fetchAllRows<CategoryRow>((from, to, count) =>
      supabase
        .from("categories")
        .select("id, name, kind, color, is_archived", { count })
        .order("name")
        .order("id")
        .range(from, to),
    ),
    // How many of this month's transactions sit in each category (the rows
    // Activity lists when you tap one). fetchAllRows: a heavy feed can pass
    // PostgREST's 1000-row cap within a month (fetch-all-rows.ts).
    fetchAllRows<{ category_id: string | null }>((from, to, count) => {
      let q = supabase
        .from("transactions")
        .select("category_id", { count })
        .gte("occurred_at", start)
        .lt("occurred_at", end)
        .not("category_id", "is", null)
        .order("id", { ascending: true })
        .range(from, to);
      if (plaidOn) q = q.is("removed_at", null).is("duplicate_of_id", null);
      return q;
    }),
  ]);

  const counts = new Map<string, number>();
  for (const r of monthRows) {
    if (r.category_id) counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1);
  }
  return { month, items: categories.map((c) => ({ ...c, txnCount: counts.get(c.id) ?? 0 })) };
}
