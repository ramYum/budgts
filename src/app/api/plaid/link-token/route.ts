/**
 * POST /api/plaid/link-token — mint a Link token for the signed-in user (web cookie session or native Bearer token;
 * see `getRequestContext`, mobile-only-transition spec §4A/§5).
 * Body (optional): `{ itemId }` to run Link in **update mode** (reconnect) — no products, uses the existing item's
 * access token. `{ platform: "ios" | "android" }` (native only) adds the native Link params — see
 * `native-link-params.ts`; omitted/`"web"` keeps today's web params exactly as before. Design §8, §23.
 */
import { NextResponse } from "next/server";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { plaidClient } from "@/lib/plaid/client";
import { getRequestContext } from "@/lib/auth/request-context";
import { isAccountDeleting } from "@/lib/account/deletion-store";
import { nativeLinkParams, type LinkPlatform } from "@/lib/plaid/native-link-params";
import { accessTokenForUserItem } from "@/server/plaid/service";

const PLATFORMS: LinkPlatform[] = ["ios", "android", "web"];

export async function POST(request: Request) {
  const ctx = await getRequestContext(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user } = ctx;

  // A deleting account must not start a new bank connection: it would be a live Item at Plaid that the
  // deletion (which already removed the user's Items) never sees.
  if (await isAccountDeleting(user.id)) {
    return NextResponse.json({ error: "account_deletion_in_progress" }, { status: 409 });
  }

  let body: { itemId?: string; platform?: string } = {};
  try {
    body = (await request.json()) as { itemId?: string; platform?: string };
  } catch {
    // empty body is fine (initial link)
  }
  const platform: LinkPlatform | undefined = PLATFORMS.includes(body.platform as LinkPlatform)
    ? (body.platform as LinkPlatform)
    : undefined;

  const cfg = loadPlaidConfig();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const base = {
    user: { client_user_id: user.id },
    client_name: "Budgts",
    language: "en",
    country_codes: cfg.countryCodes,
    webhook: `${siteUrl}/api/plaid/webhook`,
    ...(platform === "android" || platform === "ios"
      ? // Native caller: android_package_name (Android) or the native redirect_uri (iOS) — never the web one, and
        // never both platforms' params at once (Plaid rejects that). See native-link-params.ts.
        nativeLinkParams(process.env, platform)
      : // OAuth institutions (SoFi, Capital One, most large US banks) leave our
        // page entirely for the bank's own login, then need somewhere registered
        // to send the browser back — without this, Link can hang or silently fail
        // on exactly those institutions (design 2026-09-15). Omitted whenever
        // PLAID_OAUTH_REDIRECT_URI is unset: sending ANY redirect_uri Plaid's
        // dashboard doesn't have registered fails EVERY link-token create, so
        // this must never turn on by accident.
        cfg.oauthRedirectUri
        ? { redirect_uri: cfg.oauthRedirectUri }
        : {}),
  };

  try {
    let params;
    if (body.itemId) {
      const accessToken = await accessTokenForUserItem(user.id, body.itemId);
      if (!accessToken) return NextResponse.json({ error: "unknown item" }, { status: 404 });
      params = { ...base, access_token: accessToken };
    } else {
      // 60 days: the maximum historical recall the product intends to hold,
      // separate from and unrelated to the user's categorization workload
      // (which is a signup-month-day-1-through-signup-date window applied at
      // read time — see needs-category-window.ts). Data minimization matters
      // for app-store privacy review, not just server load (owner decision
      // 2026-09-12, revised 2026-09-16 from 90 days).
      params = { ...base, products: cfg.products, transactions: { days_requested: 60 } };
    }
    const res = await plaidClient().linkTokenCreate(params);
    return NextResponse.json({ link_token: res.data.link_token, expiration: res.data.expiration });
  } catch (e) {
    console.error("[plaid] link-token", e);
    return NextResponse.json({ error: "could not start the bank link" }, { status: 502 });
  }
}
