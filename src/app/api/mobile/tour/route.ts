/**
 * GET  /api/mobile/tour?phase=tour|onboarding&new=1 — the welcome guide's cards.
 *   `phase=onboarding`: Get Started's cards (before a currency is picked).
 *   `phase=tour` (default): the explainer cards, the currency and accounts they show, and whether the user has already seen
 *   the guide; `new=1` right after Get Started (the progress dots continue from its cards). 409 `not_onboarded` before a
 *   currency is picked, as the web sends the user to /onboarding.
 * POST /api/mobile/tour — the final card or Skip: marks the guide seen (`profiles.tour_seen_at`). Safe to repeat.
 *
 * Adapters over `src/lib/tour/load-tour.ts` (shared with the web pages and Server Action). Bearer only; RLS scopes every
 * query, and the user is always the verified one.
 */
import { MOBILE_API_VERSION } from "@/lib/mobile/reads";
import { mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { loadTour, loadTourSeen, markTourSeen, onboardingSteps } from "@/lib/tour/load-tour";

export const GET = mobileRoute(async ({ user, supabase }, request) => {
  const params = new URL(request.url).searchParams;
  const phase = params.get("phase") ?? "tour";
  if (phase !== "tour" && phase !== "onboarding") return mobileError("invalid_phase", 422);

  if (phase === "onboarding") {
    return mobileJson({ version: MOBILE_API_VERSION, phase, ...onboardingSteps(plaidUiEnabled()) });
  }

  const [tour, seen] = await Promise.all([
    loadTour(supabase, { userId: user.id, plaidEnabled: plaidUiEnabled(), justOnboarded: params.get("new") === "1" }),
    loadTourSeen(supabase, user.id),
  ]);
  if (!tour.onboarded) return mobileError("not_onboarded", 409);
  return mobileJson({
    version: MOBILE_API_VERSION,
    phase,
    seen,
    currency: tour.currency,
    accounts: tour.accounts,
    stepIds: tour.stepIds,
    offset: tour.offset,
    totalVisible: tour.totalVisible,
  });
});

export const POST = mobileRoute(async ({ user, supabase }) => {
  const result = await markTourSeen(supabase, user.id);
  if (result.ok) return mobileJson({ ok: true });
  return result.error === "missing" ? mobileError("profile_missing", 404) : mobileError("unavailable", 503);
});
