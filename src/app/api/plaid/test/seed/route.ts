/**
 * POST /api/plaid/test/seed — E2E-only shortcut past the un-scriptable Plaid
 * Link iframe (design §26). Mints a Sandbox `public_token` for the signed-in
 * user; the test then POSTs it to the real `/api/plaid/exchange`, so every
 * Budgts step after Link is exercised for real.
 *
 * Hard-gated: returns 404 unless BOTH `PLAID_ENV = sandbox` AND
 * `PLAID_TEST_SEED_ENABLED = 1`. Never enable it on a Production deployment.
 */
import { NextResponse } from "next/server";
import { Products } from "plaid";
import { plaidClient } from "@/lib/plaid/client";
import { getRequestContext } from "@/lib/auth/request-context";

function seedEnabled(): boolean {
  return process.env.PLAID_ENV === "sandbox" && process.env.PLAID_TEST_SEED_ENABLED === "1";
}

export async function POST(request: Request) {
  if (!seedEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Bearer too (not just the web cookie session): the native Plaid contract test seeds a sandbox public_token the
  // same way the web e2e suite does, over Bearer, since there is no native Link UI to drive in CI.
  const ctx = await getRequestContext(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { institutionId?: string };
  const institutionId =
    typeof body.institutionId === "string" && body.institutionId ? body.institutionId : "ins_109508";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  try {
    const pt = await plaidClient().sandboxPublicTokenCreate({
      institution_id: institutionId,
      initial_products: [Products.Transactions],
      options: { webhook: `${siteUrl}/api/plaid/webhook`, transactions: { days_requested: 90 } },
    });
    return NextResponse.json({
      public_token: pt.data.public_token,
      institution: { institution_id: institutionId, name: "First Platypus Bank (Sandbox)" },
    });
  } catch (e) {
    console.error("[plaid] test/seed", e);
    return NextResponse.json({ error: "seed failed" }, { status: 502 });
  }
}
