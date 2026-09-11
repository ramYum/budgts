import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { signOut } from "@/server/auth";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { Logo } from "@/components/logo";
import { BottomNav } from "@/components/bottom-nav";
import { NeedsCategoryBell } from "@/components/needs-category-bell";
import { RealtimeRefresh } from "@/components/realtime-refresh";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", user.id)
    .single();
  if (!profile?.onboarded_at) redirect("/onboarding");

  // Bank rows Budgts could not categorise — the header bell's count. Same
  // predicate as <NeedsCategory>. `removed_at` only exists where 0004 has run.
  const plaidOn = plaidUiEnabled();
  let needsCategoryCount = 0;
  if (plaidOn) {
    const { count } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("source", "bank")
      .is("category_id", null)
      .is("removed_at", null)
      .eq("is_transfer", false);
    needsCategoryCount = count ?? 0;
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      {/* Keeps the bell count fresh after a sync lands, on every dashboard route. */}
      {plaidOn ? <RealtimeRefresh tables={["transactions"]} /> : null}

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-hairline bg-bg/90 px-4 py-3 backdrop-blur">
        <Logo size={20} />
        <div className="flex items-center gap-4">
          {plaidOn ? <NeedsCategoryBell count={needsCategoryCount} /> : null}
          <form action={signOut}>
            <button
              type="submit"
              className="text-xs text-muted transition-colors hover:text-text"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-24">{children}</main>

      <BottomNav />
    </div>
  );
}
