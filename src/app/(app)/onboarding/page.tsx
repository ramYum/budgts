import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { buildTourSteps } from "@/lib/tour/steps";
import { completeOnboarding } from "@/server/onboarding";
import { OnboardingWizardContent } from "./onboarding-wizard-content";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("currency, onboarded_at")
    .eq("id", user.id)
    .single();

  if (profile?.onboarded_at) redirect("/");

  const { steps } = buildTourSteps({
    phase: "onboarding",
    plaidEnabled: plaidUiEnabled(),
    hasBank: false,
    justOnboarded: false,
  });

  return (
    <OnboardingWizardContent
      stepIds={steps.map((s) => s.id)}
      defaultCurrency={profile?.currency ?? "USD"}
      action={completeOnboarding}
    />
  );
}
