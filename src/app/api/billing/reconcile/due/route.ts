/**
 * POST /api/billing/reconcile/due — scheduled repair: re-check live entitlements against the billing provider so a
 * missed or dropped webhook cannot leave access wrong for long. Invoked by pg_cron (via pg_net) with the CRON_SECRET.
 */
import { handleReconcileCron, runBillingRoute } from "@/lib/billing/http";

export async function POST(request: Request) {
  return runBillingRoute(request, handleReconcileCron);
}
