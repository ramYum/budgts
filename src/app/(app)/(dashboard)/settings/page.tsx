import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { monthKey } from "@/lib/budget/month";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { signOut } from "@/server/auth";
import { CategoryManager, type CategoryItem } from "@/components/category-manager";
import { AccountManager, type AccountItem } from "@/components/account-manager";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();

  const [{ data: categories }, { data: accounts }, { data: profile }] = await Promise.all([
    supabase.from("categories").select("id, name, kind, color, is_archived").order("name"),
    supabase.from("accounts").select("id, name, type, is_archived").order("name"),
    supabase.from("profiles").select("currency").eq("id", user.id).single(),
  ]);

  return (
    <div className="space-y-8 pt-2">
      <h1 className="text-xl font-semibold">Settings</h1>

      <CategoryManager
        categories={(categories ?? []) as CategoryItem[]}
        currentMonth={monthKey(new Date())}
      />
      <AccountManager accounts={(accounts ?? []) as AccountItem[]} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Preferences</h2>
        <p className="text-sm text-muted">Currency: {profile?.currency ?? "USD"}</p>
        <p className="text-xs text-muted">Signed in as {user.email}</p>
      </section>

      <form action={signOut}>
        <button
          type="submit"
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
