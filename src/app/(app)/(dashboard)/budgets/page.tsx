import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { monthKey } from "@/lib/budget/month";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { MonthNav } from "@/components/month-nav";
import { BudgetEditor, type BudgetRow } from "@/components/budget-editor";
import { CopyBudgets } from "@/components/copy-budgets";
import { RealtimeRefresh } from "@/components/realtime-refresh";

export const metadata: Metadata = { title: "Budgets" };

const MONTH_RE = /^\d{4}-\d{2}$/;

export default async function BudgetsPage({ searchParams }: PageProps<"/budgets">) {
  const sp = await searchParams;
  const month = typeof sp.m === "string" && MONTH_RE.test(sp.m) ? sp.m : monthKey(new Date());

  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();

  const [{ data: categories }, { data: budgets }, { data: profile }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, color")
      .eq("kind", "expense")
      .eq("is_archived", false)
      .order("name"),
    supabase.from("budgets").select("category_id, amount").eq("month", `${month}-01`),
    supabase.from("profiles").select("currency").eq("id", user.id).single(),
  ]);

  const byCategory = new Map((budgets ?? []).map((b) => [b.category_id, b.amount]));
  const rows: BudgetRow[] = (categories ?? []).map((c) => ({
    categoryId: c.id,
    name: c.name,
    color: c.color,
    amount: byCategory.get(c.id) ?? 0,
  }));

  return (
    <div className="space-y-4 pt-1">
      <RealtimeRefresh tables={["budgets"]} />
      <div className="flex items-center justify-between">
        <MonthNav base="/budgets" month={month} />
        <CopyBudgets month={month} />
      </div>
      <p className="text-sm text-muted">
        Set a monthly limit per category. Leave one blank for no limit.
      </p>
      <BudgetEditor rows={rows} month={month} currency={profile?.currency ?? "USD"} />
    </div>
  );
}
