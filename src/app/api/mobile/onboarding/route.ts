/**
 * POST /api/mobile/onboarding — `{ currency }`: the first-run currency choice. Shares `completeOnboarding` with the web
 * Server Action, so the rule is the same on both surfaces: the currency is set once and never changed afterwards
 * (`already_onboarded` → 409). The account acted on is always the verified caller, never anything in the body.
 */
import { mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";
import { completeOnboarding } from "@/lib/profile/onboarding";

const STATUS = {
  invalid_currency: 422,
  profile_missing: 404,
  already_onboarded: 409,
  update_failed: 503,
} as const;

export const POST = mobileRoute(async ({ user, supabase }, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mobileError("invalid_body", 400);
  }

  const result = await completeOnboarding(supabase, user.id, body);
  if (!result.ok) return mobileError(result.error, STATUS[result.error]);
  return mobileJson({ onboarded: true, currency: result.currency });
});
