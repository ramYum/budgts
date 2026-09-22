/**
 * The billing HTTP handlers, with their dependencies injected so they are unit-testable without a server. Each
 * `src/app/api/billing/**\/route.ts` is a few lines that builds the deps and delegates here.
 *
 * Who is the caller, and how do we know:
 *   - entitlement GET / refresh : an authenticated user (web cookie OR mobile Bearer, via `getRequestUser`). The user
 *     id is taken ONLY from that verified identity. These handlers never read a user id from a body, query string or
 *     header, and `refresh` never reads a body at all.
 *   - RevenueCat webhook        : the provider's signature / Authorization value. The affected user comes from the
 *     verified payload's app_user_id (which is our own user id), never from the URL.
 *   - cron endpoints            : the shared CRON_SECRET bearer (same mechanism as the Plaid poller).
 *
 * Responses return the stable `EntitlementView`, never raw billing rows.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/get-request-user";
import type { BillingConfig } from "./config";
import type { Db } from "./db";
import { processRevenueCatEvent } from "./processor";
import { mapRevenueCatEvent } from "./revenuecat/map";
import { SIGNATURE_HEADER, verifyRevenueCatWebhook } from "./revenuecat/verify";
import { getEntitlementView, reconcileStale, refreshEntitlement } from "./service";

export interface HttpDeps {
  db: Db;
  config: BillingConfig;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

// --------------------------------------------------------------------------------------------- entitlement (user)

export async function handleEntitlementGet(request: Request, deps: HttpDeps): Promise<Response> {
  const user = await getRequestUser(request);
  if (!user) return json({ error: "unauthorized" }, 401);
  return json({ entitlement: await getEntitlementView(deps.db, user.id, deps.now?.()) });
}

export async function handleEntitlementRefresh(request: Request, deps: HttpDeps): Promise<Response> {
  const user = await getRequestUser(request);
  if (!user) return json({ error: "unauthorized" }, 401);
  // No body is read: the ONLY identity is the authenticated user's.
  const r = await refreshEntitlement({ db: deps.db, config: deps.config, now: deps.now, fetchImpl: deps.fetchImpl }, user.id);
  return json({ status: r.status, entitlement: r.view });
}

// ------------------------------------------------------------------------------------------- webhook (provider)

export async function handleRevenueCatWebhook(request: Request, deps: HttpDeps): Promise<Response> {
  // The RAW body: the signature is computed over the exact bytes received.
  const raw = await request.text();
  const verdict = verifyRevenueCatWebhook({
    rawBody: raw,
    signatureHeader: request.headers.get(SIGNATURE_HEADER),
    authorizationHeader: request.headers.get("authorization"),
    signingSecret: deps.config.webhookSigningSecret,
    expectedAuthorization: deps.config.webhookAuth,
    now: deps.now?.(),
  });
  if (!verdict.ok) {
    // Not configured is OUR fault (503: the provider should retry later); everything else is an unauthenticated caller.
    return json({ error: verdict.reason }, verdict.reason === "not_configured" ? 503 : 401);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = mapRevenueCatEvent(body);
  if (!parsed.ok) return json({ error: "unrecognised_payload", detail: parsed.reason }, 400);

  const outcome = await processRevenueCatEvent({ db: deps.db, environment: deps.config.environment, now: deps.now }, parsed.event);
  if (outcome.status === "failed") {
    // 5xx makes RevenueCat redeliver (up to 5 times); the failure is already recorded in billing_events.
    return json({ status: "failed" }, 500);
  }
  // Anything the mapper could not confidently apply asks the provider for its own view (best effort).
  const wantsReconcile = parsed.event.needsReconcile || (outcome.status === "processed" && outcome.needsReconcile === true);
  if (wantsReconcile && parsed.event.userId && outcome.status !== "quarantined" && outcome.status !== "duplicate") {
    try {
      await refreshEntitlement({ db: deps.db, config: deps.config, now: deps.now, fetchImpl: deps.fetchImpl }, parsed.event.userId);
    } catch {
      /* the scheduled reconcile will pick it up */
    }
  }
  // 200 for every handled outcome (incl. ignored / quarantined / duplicate): a retry would not change the answer.
  return json({ status: outcome.status });
}

// --------------------------------------------------------------------------------------------------- cron (secret)

function cronAuthorized(request: Request, config: BillingConfig): boolean {
  if (!config.cronSecret) return false;
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : header;
  const a = Buffer.from(presented);
  const b = Buffer.from(config.cronSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function handleReconcileCron(request: Request, deps: HttpDeps): Promise<Response> {
  if (!cronAuthorized(request, deps.config)) return json({ error: "unauthorized" }, 401);
  const result = await reconcileStale({ db: deps.db, config: deps.config, now: deps.now, fetchImpl: deps.fetchImpl });
  return json(result);
}
