import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";

export default async function DashboardPage() {
  // Pages render in parallel with their layouts, so the layout's redirect does
  // not stop this body running — guard here too rather than asserting non-null.
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("currency")
    .eq("id", user.id)
    .single();

  const { count: categoryCount } = await supabase
    .from("categories")
    .select("*", { count: "exact", head: true });

  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="text-sm text-muted">
        Signed in as {user.email} · budgeting in {profile?.currency}.
      </p>
      <p className="text-sm text-muted">
        {categoryCount ?? 0} categories ready. Month tiles and budget-vs-actual bars land in
        checkpoint&nbsp;1d.
      </p>
    </div>
  );
}
