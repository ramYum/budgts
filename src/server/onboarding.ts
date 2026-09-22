"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { completeOnboarding as saveOnboarding } from "@/lib/profile/onboarding";

export type OnboardingState = { error?: string };

const MESSAGES = {
  invalid_currency: "Please choose a currency.",
  // No row updated means the handle_new_user() seed trigger never created the profile. Redirecting here would bounce
  // straight back to /onboarding.
  profile_missing: "We couldn't find your profile. Sign out, sign back in, and try again.",
  update_failed: "We couldn't save your currency. Please try again.",
} as const;

/**
 * Persist the first-run currency choice and mark onboarding complete. A thin adapter: the rule (currency chosen once, only
 * for a not-yet-onboarded profile) lives in `src/lib/profile/onboarding.ts`, shared with `POST /api/mobile/onboarding`.
 */
export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const result = await saveOnboarding(supabase, user.id, { currency: formData.get("currency") });
  if (!result.ok) {
    // Already completed elsewhere (e.g. on the phone): nothing to do here, and the currency is never overwritten.
    if (result.error === "already_onboarded") redirect("/");
    return { error: MESSAGES[result.error] };
  }

  redirect("/");
}
