import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { requireTimeZone } from "@/lib/current-profile";
import { loadCategorySettings } from "@/lib/categories/load-category-settings";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { PageHeader } from "@/components/page-header";
import { AddCategoryButton, CategoryManager } from "@/components/category-manager";

export const metadata: Metadata = { title: "Categories" };

export default async function SettingsCategoriesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  // The reads live in loadCategorySettings, shared with the native app's
  // GET /api/mobile/settings/categories.
  const timeZone = await requireTimeZone(user.id);
  const { month, items } = await loadCategorySettings(await createClient(), { timeZone, plaidEnabled: plaidUiEnabled() });

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
