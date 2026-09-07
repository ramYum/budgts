import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("currency")
    .eq("id", user!.id)
    .single();

  const { count: categoryCount } = await supabase
    .from("categories")
    .select("*", { count: "exact", head: true });

  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="text-sm opacity-70">
        Signed in as {user?.email} · budgeting in {profile?.currency}.
      </p>
      <p className="text-sm opacity-70">
        {categoryCount ?? 0} categories ready. Month tiles and budget-vs-actual bars land in
        checkpoint&nbsp;1d.
      </p>
    </div>
  );
}
