import { Suspense, cache } from "react";
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

/** Bank rows awaiting a category. Cached so the mobile header and the desktop
 * bar (both render the bell) share one query per request. */
const getNeedsCategoryCount = cache(async (createdAt: string) => {
  const supabase = await createClient();
  const { count } = await applyNeedsCategoryFilter(
    supabase.from("transactions").select("id", { count: "exact", head: true }),
    createdAt,
  );
  return count ?? 0;
});

/** Streams in after the shell so the count never blocks first paint. */
async function BellWithCount({ createdAt }: { createdAt: string }) {
  return <NeedsCategoryBell count={await getNeedsCategoryCount(createdAt)} />;
}

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const supabase = await createClient();
  // One query for everything the gate needs. If app code ships before the
  // tour_seen_at migration runs this errors; fall back to the columns that
  // always exist and treat the tour as "seen" rather than looping (a missing
  // column would otherwise bounce to /onboarding, which redirects back to /).
  const full = await supabase
    .from("profiles")
    .select("onboarded_at, created_at, tour_seen_at")
    .eq("id", user.id)
    .single();
  let profile: { onboarded_at: string | null; created_at: string } | null = full.data;
  let tourSeen = true;
  if (full.error) {
    const base = await supabase
      .from("profiles")
      .select("onboarded_at, created_at")
      .eq("id", user.id)
      .single();
    profile = base.data;
  } else {
    tourSeen = !!full.data?.tour_seen_at;
  }
  if (!profile?.onboarded_at) redirect("/onboarding");
  if (!tourSeen) redirect("/tour");

  // The header bell's count (bank rows Budgts could not categorise, inside the
  // user's categorization window — same predicate as <NeedsCategory>, applied
  // by the same shared function so the two can't drift; design: 2026-09-16).
  // Rendered inside <Suspense> so it streams instead of blocking the page.
  const plaidOn = plaidUiEnabled();
  const bell = (
    <Suspense fallback={<NeedsCategoryBell count={0} />}>
      <BellWithCount createdAt={profile.created_at} />
    </Suspense>
  );

  return (
    <div className="flex min-h-dvh w-full flex-col md:pl-60">
      {/* Keeps the bell count fresh after a sync lands, on every dashboard route. */}
      {plaidOn ? <RealtimeRefresh tables={["transactions"]} /> : null}

      <DesktopSidebar />

      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-bg/90 px-4 py-3 backdrop-blur md:hidden">
        <Logo size={30} />
        <div className="flex items-center gap-4">
          {plaidOn ? bell : null}
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
          <div className="mb-2 hidden items-center justify-end md:flex">{bell}</div>
        ) : null}
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
