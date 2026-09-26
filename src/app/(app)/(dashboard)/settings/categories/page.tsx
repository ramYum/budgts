import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentMonthKey } from "@/lib/budget/month";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { PageHeader } from "@/components/page-header";
import { AddCategoryButton, CategoryManager, type CategoryItem } from "@/components/category-manager";

export const metadata: Metadata = { title: "Categories" };

export default async function SettingsCategoriesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();
  const plaidOn = plaidUiEnabled();

  const month = currentMonthKey();
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y!, m!, 1)).toISOString();

  const [{ data: categories }, monthRows] = await Promise.all([
    supabase.from("categories").select("id, name, kind, color, is_archived").order("name"),
    // How many of this month's transactions sit in each category (the rows
    // Activity lists when you tap one). fetchAllRows: a heavy feed can pass
    // PostgREST's 1000-row cap within a month (fetch-all-rows.ts).
    fetchAllRows((from, to, count) => {
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
  const items: CategoryItem[] = (categories ?? []).map((c) => ({
    ...(c as Omit<CategoryItem, "txnCount">),
    txnCount: counts.get(c.id) ?? 0,
  }));

  return (
    <>
      <PageHeader title="Categories" back="/settings" action={<AddCategoryButton />} />
      <div className="space-y-6 md:max-w-[720px]">
        <p className="text-[15px] leading-6 text-muted">Tap a category to see its transactions.</p>
        <CategoryManager categories={items} currentMonth={month} />
      </div>
    </>
  );
}
