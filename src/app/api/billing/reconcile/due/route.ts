/**
 * POST /api/billing/reconcile/due — scheduled repair: re-check live entitlements against the billing provider so a
 * missed or dropped webhook cannot leave access wrong for long. Invoked by pg_cron (via pg_net) with the CRON_SECRET.
 */
import { loadBillingConfig } from "@/lib/billing/config";
import { getServerDb } from "@/lib/billing/db";
import { handleReconcileCron } from "@/lib/billing/http";

export async function POST(request: Request) {
  return handleReconcileCron(request, { db: await getServerDb(), config: loadBillingConfig() });
}
