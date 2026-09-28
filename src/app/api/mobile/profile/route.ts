/**
 * GET /api/mobile/profile — who the caller is and where they are in first-run onboarding.
 * PATCH /api/mobile/profile — `{ time_zone }`: the device's IANA zone, whenever it differs from the stored one (the app
 * checks on launch and on every return to the foreground), the same rule `<TimeZoneSync>` follows on the web.
 *
 * The native app calls GET after sign-in: `onboarded: false` sends the user to Get Started (`POST /api/mobile/onboarding`).
 * `supportedCurrencies` is the server's list, so the app never carries a second copy that could drift. `timeZone` is the
 * stored zone the app compares its device's against; `month` and `today` are the user's own "this month" and "today" in
 * that zone (null before onboarding), so the app never decides them from the device clock. The app re-reads this on
 * every return to the foreground, so they roll over at the user's midnight. Bearer only; the profile is read and written through the caller's
 * own JWT (RLS), and the id is always the verified user's.
 */
import { SUPPORTED_CURRENCIES } from "@/lib/budget/currencies";
import { currentMonthKey, todayDateKey } from "@/lib/budget/month";
import { mobileError, mobileJson, mobileRoute, readJson } from "@/lib/mobile/route";
import { loadProfile, saveTimeZone } from "@/lib/profile/onboarding";

export const GET = mobileRoute(async ({ user, supabase }) => {
  const profile = await loadProfile(supabase, user.id);
  if (!profile) return mobileError("profile_missing", 404);
  return mobileJson({
    email: user.email ?? null,
    currency: profile.currency,
    onboarded: profile.onboarded,
    timeZone: profile.timeZone,
    month: profile.timeZone ? currentMonthKey(profile.timeZone) : null,
    today: profile.timeZone ? todayDateKey(profile.timeZone) : null,
    supportedCurrencies: [...SUPPORTED_CURRENCIES],
  });
});

const PATCH_STATUS = { invalid_time_zone: 422, profile_missing: 404, update_failed: 503 } as const;

export const PATCH = mobileRoute(async ({ user, supabase }, request) => {
  const body = (await readJson(request)) as { time_zone?: unknown } | null;
  if (!body || typeof body !== "object") return mobileError("invalid_body", 400);

  const result = await saveTimeZone(supabase, user.id, body.time_zone);
  if (!result.ok) return mobileError(result.error, PATCH_STATUS[result.error]);
  return mobileJson({ timeZone: result.timeZone });
});
