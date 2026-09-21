/**
 * POST /api/billing/webhook/revenuecat — inbound RevenueCat webhook. Verifies the signature / Authorization value,
 * logs the event idempotently, and applies it (ledger + entitlement) in one transaction. Server-to-server: it has no
 * user cookie, so the proxy lists it as public (src/proxy.ts) and this handler does its own authentication.
 */
import { loadBillingConfig } from "@/lib/billing/config";
import { getServerDb } from "@/lib/billing/db";
import { handleRevenueCatWebhook } from "@/lib/billing/http";

export async function POST(request: Request) {
  return handleRevenueCatWebhook(request, { db: await getServerDb(), config: loadBillingConfig() });
}
