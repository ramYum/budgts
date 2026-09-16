import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { signOut } from "@/server/auth";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { applyNeedsCategoryFilter } from "@/lib/plaid/needs-category-window";
import { Logo } from "@/components/logo";
import { BottomNav } from "@/components/bottom-nav";
import { DesktopSidebar } from "@/components/desktop-sidebar";
import { NeedsCategoryBell } from "@/components/needs-category-bell";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { ReviewBanner } from "@/components/plaid/review-banner";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at, created_at")
    .eq("id", user.id)
    .single();
  if (!profile?.onboarded_at) redirect("/onboarding");

  // Queried separately from onboarded_at above: if app code ships before the
  // tour_seen_at migration runs, this query errors and we treat that as
  // "seen" rather than looping (a missing profiles.onboarded_at select would
  // otherwise bounce to /onboarding, which redirects straight back to /).
  const { data: tourProfile, error: tourErr } = await supabase
    .from("profiles")
    .select("tour_seen_at")
    .eq("id", user.id)
    .single();
  if (!tourErr && !tourProfile?.tour_seen_at) redirect("/tour");

  // Bank rows Budgts could not categorise, inside the user's categorization
  // window — the header bell's count. Same predicate as <NeedsCategory>,
  // applied by the same shared function so the two can't drift (design:
  // 2026-09-16). `removed_at` only exists where 0004 has run.
  const plaidOn = plaidUiEnabled();
  let needsCategoryCount = 0;
  if (plaidOn) {
    const { count } = await applyNeedsCategoryFilter(
      supabase.from("transactions").select("id", { count: "exact", head: true }),
      profile.created_at,
    );
    needsCategoryCount = count ?? 0;
  }

  return (
    <div className="flex min-h-dvh w-full flex-col md:pl-60">
      {/* Keeps the bell count fresh after a sync lands, on every dashboard route. */}
      {plaidOn ? <RealtimeRefresh tables={["transactions"]} /> : null}

      <DesktopSidebar />

      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-bg/90 px-4 py-3 backdrop-blur md:hidden">
        <Logo size={30} />
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

      {plaidOn ? <ReviewBanner /> : null}

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4 pb-24 md:max-w-4xl md:px-8 md:py-8 md:pb-8">
        {plaidOn ? (
          <div className="mb-2 hidden items-center justify-end md:flex">
            <NeedsCategoryBell count={needsCategoryCount} />
          </div>
        ) : null}
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
