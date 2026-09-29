import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { onboardingSteps } from "@/lib/tour/load-tour";
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

  // Shared with the native app's GET /api/mobile/tour?phase=onboarding.
  const { stepIds, totalVisible } = onboardingSteps(plaidUiEnabled());

  return (
    <OnboardingWizardContent
      stepIds={stepIds}
      totalVisible={totalVisible}
      defaultCurrency={profile?.currency ?? "USD"}
      action={completeOnboarding}
    />
  );
}
