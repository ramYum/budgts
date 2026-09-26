import { Suspense, cache } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { firstRunRedirect } from "@/lib/tour/gate";
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
  // One query for everything the gate needs. The welcome guide plays for every
  // new user, so a failed read must not guess "already seen" and wave them
  // past it: it surfaces (error boundary, with a retry) instead.
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("onboarded_at, created_at, tour_seen_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load your profile: ${error.message}`);
  const firstRun = firstRunRedirect(profile);
  if (firstRun || !profile) redirect(firstRun ?? "/onboarding");

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
    <div className="flex min-h-dvh w-full flex-col md:pl-[248px]">
      {/* Keeps the bell count fresh after a sync lands, on every dashboard route. */}
      {plaidOn ? <RealtimeRefresh tables={["transactions"]} /> : null}

      <DesktopSidebar email={user.email ?? ""} />

      {/* Phone: the brand and the bell; sign out lives in Settings. */}
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between bg-bg/90 px-6 backdrop-blur-xl md:hidden">
        <Link href="/" aria-label="Budgts home" className="press">
          <Logo size={22} />
        </Link>
        {plaidOn ? bell : null}
      </header>

      {plaidOn ? (
        <Suspense fallback={null}>
          <ReviewBanner />
        </Suspense>
      ) : null}

      {/* One content column, 1040px at most (pages lay out their own tracks),
          inset 24px from a phone's edges so cards sit off the glass. On
          desktop the bell closes the page's header row: it sits in the
          top-right corner, and <PageHeader> leaves room for it. */}
      <main className="relative mx-auto w-full max-w-[1136px] flex-1 px-6 pb-28 pt-2 md:px-12 md:pb-16 md:pt-10">
        {plaidOn ? <div className="absolute right-12 top-10 hidden md:block">{bell}</div> : null}
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
