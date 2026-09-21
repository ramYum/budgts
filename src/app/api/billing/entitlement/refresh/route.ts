/**
 * POST /api/billing/entitlement/refresh — reconcile the caller's entitlement against the billing provider (call it
 * after a purchase, on "restore purchases", and when the app returns to the foreground). The request body is never
 * read: the only identity is the authenticated user's, and the server — not the purchase UI — decides access.
 */
import { loadBillingConfig } from "@/lib/billing/config";
import { getServerDb } from "@/lib/billing/db";
import { handleEntitlementRefresh } from "@/lib/billing/http";

export async function POST(request: Request) {
  return handleEntitlementRefresh(request, { db: await getServerDb(), config: loadBillingConfig() });
}
