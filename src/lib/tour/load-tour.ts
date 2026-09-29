/**
 * The welcome guide's data and its one write, shared by the web (`/tour`, `/onboarding`, `src/server/tour.ts`) and the
 * native `/api/mobile/tour` (2026-09-29, Stage 2B; moved from the web pages and action without changing a rule).
 *
 * - `loadTour`: which cards to show (`buildTourSteps`), plus what the cards display (the currency, the accounts) and whether
 *   a bank is connected. A Plaid-tables read error is "not present", not "has no bank", exactly as the web page treats it.
 * - `onboardingSteps`: the cards Get Started shows before the currency is chosen.
 * - `markTourSeen`: stamps `profiles.tour_seen_at` (the first-run gate, `src/lib/tour/gate.ts`), on the final card and on
 *   Skip. Safe to repeat: every call just re-stamps the time.
 *
 * Framework-free; the caller supplies the user's Supabase client (RLS scopes every query).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTourSteps, type TourStepId } from "@/lib/tour/steps";

export type TourData = {
  /** False when the user has not picked a currency yet (the web sends them to /onboarding). */
  onboarded: boolean;
  currency: string;
  accounts: { id: string; name: string }[];
  stepIds: TourStepId[];
  /** How many onboarding cards came before these (the progress dots continue from there). */
  offset: number;
  totalVisible: number;
};

export async function loadTour(
  supabase: SupabaseClient,
  input: { userId: string; plaidEnabled: boolean; justOnboarded: boolean },
): Promise<TourData> {
  const [profileRes, bankRes, accountsRes] = await Promise.all([
    supabase.from("profiles").select("onboarded_at, currency").eq("id", input.userId).single(),
    supabase.from("plaid_items").select("id", { count: "exact", head: true }),
    supabase.from("accounts").select("id, name").eq("is_archived", false).order("name").limit(500),
  ]);
  const profile = profileRes.data as { onboarded_at: string | null; currency: string | null } | null;

  // Plaid tables not migrated on this deployment yet — same "not present"
  // treatment as BankConnections; not the same thing as "has no bank".
  const hasBank = input.plaidEnabled && !bankRes.error && (bankRes.count ?? 0) > 0;
  const { steps, offset, totalVisible } = buildTourSteps({
    phase: "tour",
    plaidEnabled: input.plaidEnabled,
    hasBank,
    justOnboarded: input.justOnboarded,
  });

  return {
    onboarded: profile?.onboarded_at != null,
    currency: profile?.currency ?? "USD",
    accounts: (accountsRes.data ?? []) as { id: string; name: string }[],
    stepIds: steps.map((s) => s.id),
    offset,
    totalVisible,
  };
}

/** Get Started's cards (before the currency is picked). */
export function onboardingSteps(plaidEnabled: boolean): { stepIds: TourStepId[]; totalVisible: number } {
  const { steps, totalVisible } = buildTourSteps({ phase: "onboarding", plaidEnabled, hasBank: false, justOnboarded: false });
  return { stepIds: steps.map((s) => s.id), totalVisible };
}

/** Whether the user has finished or skipped the welcome guide. Throws on a read error (never a guessed "seen"). */
export async function loadTourSeen(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("profiles").select("tour_seen_at").eq("id", userId).maybeSingle();
  if (error) throw new Error("profile_read_failed");
  return (data as { tour_seen_at: string | null } | null)?.tour_seen_at != null;
}

export type MarkTourSeenResult = { ok: true } | { ok: false; error: "missing" } | { ok: false; error: "failed"; message: string };

export async function markTourSeen(supabase: SupabaseClient, userId: string, now: Date = new Date()): Promise<MarkTourSeenResult> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ tour_seen_at: now.toISOString() })
    .eq("id", userId)
    .select("id");
  if (error) return { ok: false, error: "failed", message: error.message };
  return data?.length ? { ok: true } : { ok: false, error: "missing" };
}
