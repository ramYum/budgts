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
  // link-token, exchange and item authenticate through getRequestContext
  // (cookie or Bearer) so the native app can call them; without these a
  // cookie-less native request 307s to the HTML sign-in page.
  "/api/plaid/link-token",
  "/api/plaid/exchange",
  "/api/plaid/item",
  // Sandbox-only (404 unless PLAID_ENV=sandbox and PLAID_TEST_SEED_ENABLED=1),
  // and it authenticates itself (cookie or Bearer).
  "/api/plaid/test/seed",
  // Universal-link / app-link association files (fetched by Apple and Google,
  // never signed in; 404 until configured) and the native Plaid OAuth return,
  // whose web fallback page must load when the app is not installed.
  "/.well-known/",
  "/app/plaid-oauth",
  // The legal and support pages the stores, Google's OAuth consent screen and
  // the apps link to, and the switch the apps read (src/lib/legal/config.ts).
  // Public whether or not the switch is on: while it is off each page is a
  // 404, which a signed-out visitor should see as such, not be sent to sign in
  // first and then land on the 404. None of them reads user data.
  "/privacy",
  "/terms",
  "/support",
  "/account-deletion",
  "/api/legal",
  // Where a completed deletion lands: the user was just signed out.
  "/account-deleted",
  // The company homepage (below), public at its own address too.
  "/company",
  // For search engines (src/app/robots.ts, src/app/sitemap.ts): never sent to sign-in. Like every entry here these
  // match as prefixes; `/robots.txt/…` and `/sitemap.xml/…` have no route, so they fall to the (app) catch-all, whose
  // layout sends a signed-out visitor to sign-in. Neither file carries user data.
  "/robots.txt",
  "/sitemap.xml",
];

/**
 * The company homepage (spec §13a, Phase 1b). The dashboard also lives at `/`, so a signed-out visitor of `/` is
 * shown this page by a rewrite: the address stays budgts.com and answers 200, for people and crawlers alike, while a
 * signed-in user still gets the dashboard at the same address.
 */
export const HOMEPAGE_PATH = "/company";

export function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/"),
  );
}

/** Session refresh + auth gate. (Next 16 renamed `middleware` -> `proxy`.) */
export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!user && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = HOMEPAGE_PATH;
    const rewrite = NextResponse.rewrite(url);
    response.cookies.getAll().forEach((c) => rewrite.cookies.set(c));
    return rewrite;
  }

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
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
