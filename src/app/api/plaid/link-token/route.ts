/**
 * POST /api/plaid/link-token — mint a Link token for the signed-in user.
 * Body (optional): `{ itemId }` to run Link in **update mode** (reconnect) —
 * no products, uses the existing item's access token. Design §8, §23.
 */
import { NextResponse } from "next/server";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { plaidClient } from "@/lib/plaid/client";
import { getSessionUser } from "@/lib/supabase/server";
import { accessTokenForUserItem } from "@/server/plaid/service";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { itemId?: string } = {};
  try {
    body = (await request.json()) as { itemId?: string };
  } catch {
    // empty body is fine (initial link)
  }

  const cfg = loadPlaidConfig();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const base = {
    user: { client_user_id: user.id },
    client_name: "Budgt",
    language: "en",
    country_codes: cfg.countryCodes,
    webhook: `${siteUrl}/api/plaid/webhook`,
  };

  try {
    let params;
    if (body.itemId) {
      const accessToken = await accessTokenForUserItem(user.id, body.itemId);
      if (!accessToken) return NextResponse.json({ error: "unknown item" }, { status: 404 });
      params = { ...base, access_token: accessToken };
    } else {
      // 90 days (~3 months): enough for meaningful budget-vs-actual context and
      // a head start on recurring-transaction detection, without holding more
      // financial history than the app needs — data minimization matters for
      // app-store privacy review, not just server load (owner decision 2026-09-12).
      params = { ...base, products: cfg.products, transactions: { days_requested: 90 } };
    }
    const res = await plaidClient().linkTokenCreate(params);
    return NextResponse.json({ link_token: res.data.link_token, expiration: res.data.expiration });
  } catch (e) {
    console.error("[plaid] link-token", e);
    return NextResponse.json({ error: "could not start the bank link" }, { status: 502 });
  }
}
