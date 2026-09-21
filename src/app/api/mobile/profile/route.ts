/**
 * GET /api/mobile/profile — who the caller is and where they are in first-run onboarding.
 *
 * The native app calls this after sign-in: `onboarded: false` sends the user to Get Started to choose a currency
 * (`POST /api/mobile/onboarding`). `supportedCurrencies` is the server's list, so the app never carries a second copy that
 * could drift. Bearer only; the profile is read through the caller's own JWT (RLS), and the id is the verified user's.
 */
import { mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";
import { loadProfile } from "@/lib/profile/onboarding";
import { SUPPORTED_CURRENCIES } from "@/lib/validation/profile";

export const GET = mobileRoute(async ({ user, supabase }) => {
  const profile = await loadProfile(supabase, user.id);
  if (!profile) return mobileError("profile_missing", 404);
  return mobileJson({
    email: user.email ?? null,
    currency: profile.currency,
    onboarded: profile.onboarded,
    supportedCurrencies: [...SUPPORTED_CURRENCIES],
  });
});
