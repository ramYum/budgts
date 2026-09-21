/**
 * Profile read + first-run onboarding, shared by the web Server Action (`src/server/onboarding.ts`) and the native routes
 * (`/api/mobile/profile`, `/api/mobile/onboarding`) — one implementation of the rule, two thin adapters.
 *
 * The currency is chosen once: `completeOnboarding` only updates a profile whose `onboarded_at` is still null, so a
 * retry, a second device or a hand-crafted request can never change the currency of an established account (every stored
 * amount is interpreted in it).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { currencySchema, type Currency } from "@/lib/validation/profile";

export type Profile = { currency: string; onboarded: boolean };

/** The caller's profile, or null when the seed trigger never created one. Throws on a read error (never a guessed state). */
export async function loadProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("currency, onboarded_at").eq("id", userId).maybeSingle();
  if (error) throw new Error("profile_read_failed");
  return data ? { currency: data.currency as string, onboarded: data.onboarded_at != null } : null;
}

export type OnboardingResult =
  | { ok: true; currency: Currency }
  | { ok: false; error: "invalid_currency" | "profile_missing" | "already_onboarded" | "update_failed" };

export async function completeOnboarding(
  supabase: SupabaseClient,
  userId: string,
  input: unknown,
  now: Date = new Date(),
): Promise<OnboardingResult> {
  const parsed = currencySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_currency" };

  const { data, error } = await supabase
    .from("profiles")
    .update({ currency: parsed.data.currency, onboarded_at: now.toISOString() })
    .eq("id", userId)
    .is("onboarded_at", null)
    .select("id");
  if (error) return { ok: false, error: "update_failed" };
  if (data?.length) return { ok: true, currency: parsed.data.currency };

  // Nothing updated: either the profile was already completed, or it does not exist. Say which.
  try {
    return { ok: false, error: (await loadProfile(supabase, userId)) ? "already_onboarded" : "profile_missing" };
  } catch {
    return { ok: false, error: "update_failed" };
  }
}
