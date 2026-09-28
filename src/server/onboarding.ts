"use server";

import { revalidateUserData } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { completeOnboarding as completeOnboardingFor } from "@/lib/profile/onboarding";

export type OnboardingState = { error?: string };

/** Persist the first-run currency choice and the device's time zone, and
 * mark onboarding complete. The rule lives in `src/lib/profile/onboarding.ts`
 * (shared with the native app); this adapter maps it to the web form. */
export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const result = await completeOnboardingFor(supabase, user.id, {
    currency: formData.get("currency"),
    time_zone: formData.get("time_zone"),
  });

  if (!result.ok) {
    switch (result.error) {
      case "invalid_currency":
        return { error: "Please choose a currency." };
      case "invalid_time_zone":
        return {
          error: "Your device didn't report a time zone we recognise. Check its date and time settings, then try again.",
        };
      // No row updated means the handle_new_user() seed trigger never created
      // the profile. Redirecting here would bounce straight back to /onboarding.
      case "profile_missing":
        return { error: "We couldn't find your profile. Sign out, sign back in, and try again." };
      // Already onboarded (a double submit, or another device got there
      // first): the currency is set once, so nothing changes. The dashboard
      // gate sends the user on to the welcome guide if they haven't seen it.
      case "already_onboarded":
        revalidateUserData();
        redirect("/");
      default:
        return { error: result.message ?? "Something went wrong. Please try again." };
    }
  }

  // The dashboard layout gate (onboarded/tour redirects) was rendered into the
  // client router cache before this flag flipped; with staleTimes.dynamic that
  // stale gate would bounce the user back. Purge it before navigating on.
  revalidateUserData();
  redirect("/tour?new=1");
}
