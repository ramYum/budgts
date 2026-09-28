/**
 * Profile read, first-run onboarding and the device time zone, shared by the web Server Actions
 * (`src/server/onboarding.ts`, `src/server/time-zone.ts`) and the native routes (`/api/mobile/profile`,
 * `/api/mobile/onboarding`): one implementation of each rule, thin adapters around it.
 *
 * - The currency is chosen once: `completeOnboarding` only updates a profile whose `onboarded_at` is still null, so a
 *   retry, a second device or a hand-crafted request can never change the currency of an established account (every
 *   stored amount is interpreted in it).
 * - Onboarding stores the device's IANA time zone with it (DB check `profiles_time_zone_when_onboarded`): the user's
 *   "today" and "this month" follow it (`src/lib/budget/month.ts`).
 * - `saveTimeZone` keeps the zone in step with the device afterwards, the rule `<TimeZoneSync>` follows on the web.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Currency } from "@/lib/budget/currencies";
import { currencySchema, timeZoneSchema } from "@/lib/validation/profile";

export type Profile = { currency: string; onboarded: boolean; timeZone: string | null };

/** The caller's profile, or null when the seed trigger never created one. Throws on a read error (never a guessed state). */
export async function loadProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("currency, onboarded_at, time_zone")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("profile_read_failed");
  return data
    ? {
        currency: data.currency as string,
        onboarded: data.onboarded_at != null,
        timeZone: (data.time_zone as string | null) ?? null,
      }
    : null;
}

export type OnboardingError =
  | "invalid_currency"
  | "invalid_time_zone"
  | "profile_missing"
  | "already_onboarded"
  | "update_failed";

export type OnboardingResult =
  | { ok: true; currency: Currency; timeZone: string }
  | { ok: false; error: OnboardingError; message?: string };

/** `input` is `{ currency, time_zone }` straight from the caller; validated here. */
export async function completeOnboarding(
  supabase: SupabaseClient,
  userId: string,
  input: unknown,
  now: Date = new Date(),
): Promise<OnboardingResult> {
  const fields = (input ?? {}) as { currency?: unknown; time_zone?: unknown };
  const currency = currencySchema.safeParse({ currency: fields.currency });
  if (!currency.success) return { ok: false, error: "invalid_currency" };
  const zone = timeZoneSchema.safeParse(fields.time_zone);
  if (!zone.success) return { ok: false, error: "invalid_time_zone" };

  const { data, error } = await supabase
    .from("profiles")
    .update({ currency: currency.data.currency, time_zone: zone.data, onboarded_at: now.toISOString() })
    .eq("id", userId)
    .is("onboarded_at", null)
    .select("id");
  if (error) return { ok: false, error: "update_failed", message: error.message };
  if (data?.length) return { ok: true, currency: currency.data.currency, timeZone: zone.data };

  // Nothing updated: either the profile was already completed, or it does not exist. Say which.
  try {
    return { ok: false, error: (await loadProfile(supabase, userId)) ? "already_onboarded" : "profile_missing" };
  } catch {
    return { ok: false, error: "update_failed" };
  }
}

export type SaveTimeZoneResult =
  | { ok: true; timeZone: string }
  | { ok: false; error: "invalid_time_zone" | "profile_missing" | "update_failed"; message?: string };

/** Stores the zone the device reports, exactly as reported (never canonicalised: the device's value is compared to it). */
export async function saveTimeZone(supabase: SupabaseClient, userId: string, timeZone: unknown): Promise<SaveTimeZoneResult> {
  const parsed = timeZoneSchema.safeParse(timeZone);
  if (!parsed.success) return { ok: false, error: "invalid_time_zone" };

  const { data, error } = await supabase.from("profiles").update({ time_zone: parsed.data }).eq("id", userId).select("id");
  if (error) return { ok: false, error: "update_failed", message: error.message };
  if (!data?.length) return { ok: false, error: "profile_missing" };
  return { ok: true, timeZone: parsed.data };
}
