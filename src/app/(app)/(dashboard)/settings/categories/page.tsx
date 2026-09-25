import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentMonthKey } from "@/lib/budget/month";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { CategoryManager, type CategoryItem } from "@/components/category-manager";

export const metadata: Metadata = { title: "Categories" };

export default async function SettingsCategoriesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, kind, color, is_archived")
    .order("name");

  return (
    <div className="pt-1">
      <PageHeader title="Categories" back="/settings" />
      <CategoryManager
        categories={(categories ?? []) as CategoryItem[]}
        currentMonth={currentMonthKey()}
      />
    </div>
  );
}
