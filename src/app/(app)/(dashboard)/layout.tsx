import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { signOut } from "@/server/auth";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { Logo } from "@/components/logo";
import { BottomNav } from "@/components/bottom-nav";
import { DesktopSidebar } from "@/components/desktop-sidebar";
import { NeedsCategoryBell } from "@/components/needs-category-bell";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { ReviewBanner } from "@/components/plaid/review-banner";
import { LimitedHistoryBanner } from "@/components/plaid/limited-history-banner";

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
      .eq("is_transfer", false)
      // A confirmed duplicate (design: 2026-09-12 Phase 15) is never real work
      // to do — exclude it, matching the query in transactions/page.tsx.
      .is("duplicate_of_id", null);
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
      {plaidOn ? <LimitedHistoryBanner /> : null}

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
