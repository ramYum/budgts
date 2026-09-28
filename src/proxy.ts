import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Paths reachable without a session. Includes the two Plaid endpoints that are
// called server-to-server with their own auth (JWT signature / bearer secret,
// not a user cookie) — Plaid's webhook and the pg_cron poller. Without this,
// the proxy 307-redirects their unauthenticated request to /sign-in before the
// route handler ever runs (design §20 / workstream B).
const PUBLIC_PREFIXES = [
  "/sign-in",
  "/auth/",
  "/offline",
  "/api/plaid/webhook",
  "/api/plaid/sync-due",
  "/api/plaid/recurring-scan",
  // The native app's API authenticates itself: every /api/mobile/* handler
  // goes through mobileRoute(), which verifies the caller's Bearer token and
  // answers 401 without one. The proxy can't see that token, so without this
  // a cookie-less native request would be 307-redirected to the HTML
  // /sign-in page before the handler's own check ever ran.
  "/api/mobile/",
  // Billing routes authenticate themselves: the entitlement endpoints through
  // getRequestUser() (cookie or Bearer), the RevenueCat webhook by the
  // provider's signature, the reconcile cron by CRON_SECRET. Each answers its
  // own 401; the proxy must not 307 a cookie-less caller to /sign-in first.
  "/api/billing/",
  // Account deletion authenticates itself (getPrivilegedUser: cookie or
  // Bearer, re-checked with Supabase Auth) so the native app can call it; an
  // unauthenticated caller still gets the handler's own 401.
  "/api/account/delete",
];

export function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/"),
  );
}

/** Session refresh + auth gate. (Next 16 renamed `middleware` -> `proxy`.) */
export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  if (user && pathname === "/sign-in") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}

export const config = {
  // Run on everything except Next internals and static asset files. `sw.js` is
  // excluded too — the service-worker script must not 3xx-redirect or the
  // browser refuses to register it ("script resource is behind a redirect").
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
