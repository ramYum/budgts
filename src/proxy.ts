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
  // Mobile-ready Route Handlers authenticate themselves via
  // getRequestUser() (web cookie OR mobile Bearer token, verified
  // server-side against Supabase Auth) — same "has its own auth, the proxy
  // can't see it" reasoning as the Plaid endpoints above. Without this, a
  // cookie-less mobile request gets 307-redirected to the HTML /sign-in
  // page before the route handler (and its Bearer check) ever runs.
  // Unauthenticated callers still get a real 401 from the handler itself,
  // not a weaker check — this only changes *where* that check happens.
  "/api/account/delete",
  "/api/mobile/",
  // Billing routes each authenticate themselves, none via the web cookie: the entitlement endpoints resolve a
  // user through getRequestUser() (cookie OR Bearer), the RevenueCat webhook verifies the provider's
  // signature, and the cron endpoints present the CRON_SECRET bearer. An unauthenticated caller still gets a real
  // 401 from the handler — the proxy just must not 307 a cookie-less request to the HTML sign-in page first.
  "/api/billing/",
  // The public "Manage subscription" landing page (the reminder email links here; it must work signed out).
  "/manage-subscription",
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
