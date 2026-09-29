import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { loadTour } from "@/lib/tour/load-tour";
import { completeTour } from "@/server/tour";
import { TourWizardContent } from "./tour-wizard-content";

export const metadata: Metadata = { title: "Welcome guide" };

/**
 * The explainer half of the welcome guide, shown after `/onboarding`
 * completes and (with Crystal's intro cards prepended) on every replay from
 * Help. See docs/specs/2026-09-25-welcome-guide-design.md.
 */
export default async function TourPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { new: newParam } = await searchParams;
  // The reads and the card list live in loadTour, shared with the native app's GET /api/mobile/tour.
  const tour = await loadTour(await createClient(), {
    userId: user.id,
    plaidEnabled: plaidUiEnabled(),
    justOnboarded: newParam === "1",
  });
  if (!tour.onboarded) redirect("/onboarding");

  return (
    <TourWizardContent
      stepIds={tour.stepIds}
      offset={tour.offset}
      totalVisible={tour.totalVisible}
      currency={tour.currency}
      accounts={tour.accounts}
      action={completeTour}
    />
  );
}
