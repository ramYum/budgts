"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currencySchema } from "@/lib/validation/profile";

export type OnboardingState = { error?: string };

/** Persist the first-run currency choice and mark onboarding complete. */
export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = currencySchema.safeParse({ currency: formData.get("currency") });
  if (!parsed.success) return { error: "Please choose a currency." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data, error } = await supabase
    .from("profiles")
    .update({ currency: parsed.data.currency, onboarded_at: new Date().toISOString() })
    .eq("id", user.id)
    .select("id");

  if (error) return { error: error.message };
  // No row updated means the handle_new_user() seed trigger never created the
  // profile. Redirecting here would bounce straight back to /onboarding.
  if (!data?.length) {
    return { error: "We couldn't find your profile. Sign out, sign back in, and try again." };
  }

  // The dashboard layout gate (onboarded/tour redirects) was rendered into the
  // client router cache before this flag flipped; with staleTimes.dynamic that
  // stale gate would bounce the user back. Purge it before navigating on.
  revalidatePath("/", "layout");
  redirect("/tour?new=1");
}
