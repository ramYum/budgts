import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { buildTourSteps } from "@/lib/tour/steps";
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

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at, currency")
    .eq("id", user.id)
    .single();
  if (!profile?.onboarded_at) redirect("/onboarding");

  const plaidEnabled = plaidUiEnabled();

  const [{ count: bankCount, error: bankErr }, { data: accountsData }] = await Promise.all([
    supabase.from("plaid_items").select("id", { count: "exact", head: true }),
    supabase.from("accounts").select("id, name").eq("is_archived", false).order("name"),
  ]);
  // Plaid tables not migrated on this deployment yet — same "not present"
  // treatment as BankConnections; not the same thing as "has no bank".
  const hasBank = plaidEnabled && !bankErr && (bankCount ?? 0) > 0;

  const { new: newParam } = await searchParams;
  const justOnboarded = newParam === "1";

  const { steps, offset, totalVisible } = buildTourSteps({
    phase: "tour",
    plaidEnabled,
    hasBank,
    justOnboarded,
  });

  return (
    <TourWizardContent
      stepIds={steps.map((s) => s.id)}
      offset={offset}
      totalVisible={totalVisible}
      currency={profile.currency ?? "USD"}
      accounts={accountsData ?? []}
      action={completeTour}
    />
  );
}
