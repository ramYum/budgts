"use server";

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

  const { error } = await supabase
    .from("profiles")
    .update({ currency: parsed.data.currency, onboarded_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message };
  redirect("/");
}
