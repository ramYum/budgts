/**
 * GET /api/billing/entitlement — the caller's OWN entitlement as a stable view-model. Identity comes only from the
 * verified session / Bearer token; nothing in the request selects whose entitlement is returned.
 */
import { handleEntitlementGet, runBillingRoute } from "@/lib/billing/http";

export async function GET(request: Request) {
  return runBillingRoute(request, handleEntitlementGet);
}
