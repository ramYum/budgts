/**
 * GET /api/mobile/account/delete — Settings → Delete account's first state: whether the sign-in is recent enough to
 * confirm without a fresh sign-in (the 10-minute step-up), whether Google is linked (which fresh sign-in to offer),
 * whether a deletion already started, and the facts the copy shows (support email, billing live, records kept).
 * `deletionScreenState` is the web screen's own decision. The deletion itself stays `POST /api/account/delete`, which
 * re-checks everything.
 *
 * Bearer only. The user is re-read from Supabase Auth over the network (`getPrivilegedUser`), as the deletion route does:
 * a revoked session is refused and `last_sign_in_at` is current. Nothing about the account is returned beyond its email.
 */
import { deletionScreenState } from "@/lib/account/deletion-screen";
import { MOBILE_API_VERSION } from "@/lib/mobile/reads";
import { mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";
import type { MobileDeleteScreen } from "@/lib/mobile/screens";
import { getPrivilegedUser } from "@/server/privileged-user";

export const GET = mobileRoute(async ({ user: verified, supabase }, request) => {
  const user = await getPrivilegedUser(request);
  if (!user || user.id !== verified.id) return mobileError("unauthorized", 401);
  const body: MobileDeleteScreen = { version: MOBILE_API_VERSION, ...(await deletionScreenState(user, supabase)) };
  return mobileJson(body);
});
