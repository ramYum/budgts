/**
 * POST /api/billing/entitlement/refresh — reconcile the caller's entitlement against the billing provider (call it
 * after a purchase, on "restore purchases", and when the app returns to the foreground). The request body is never
 * read: the only identity is the authenticated user's, and the server — not the purchase UI — decides access.
 */
import { handleEntitlementRefresh, runBillingRoute } from "@/lib/billing/http";

export async function POST(request: Request) {
  return runBillingRoute(request, handleEntitlementRefresh);
}
