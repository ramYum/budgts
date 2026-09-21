/**
 * RevenueCat subscriber state -> a reconciliation SNAPSHOT event. Used by the authenticated refresh endpoint (after a
 * purchase, on restore, on app start) and by the scheduled reconcile job, so a missed or dropped webhook can never
 * leave a user's access wrong for long. The provider's REST API is queried server-side with a SECRET key that never
 * reaches a client bundle (docs: GET /v1/subscribers/{app_user_id}, `Authorization: Bearer <secret key>`).
 *
 * Fields used (all from RevenueCat's documented subscriber object; everything optional/nullable and validated,
 * because live sandbox verification is blocked on store enrolment — see docs/specs/2026-09-21-v1-monetization-design.md):
 *   subscriptions[productId]: expires_date, purchase_date, period_type ("trial"|"normal"|...), store, is_sandbox,
 *   unsubscribe_detected_at, billing_issues_detected_at, grace_period_expires_date.
 * `expires_date` is the moment access ends (during a grace period it equals the grace expiry).
 */
import { z } from "zod";
import type { EntitlementState, Store } from "../entitlement";
import type { DomainEvent } from "../events";
import { PROVIDER } from "./map";

const str = z.string().nullish();

const Subscription = z
  .object({
    expires_date: str,
    purchase_date: str,
    period_type: str,
    store: str,
    is_sandbox: z.boolean().nullish(),
    unsubscribe_detected_at: str,
    billing_issues_detected_at: str,
    grace_period_expires_date: str,
  })
  .loose();

const SubscriberResponse = z
  .object({ subscriber: z.object({ subscriptions: z.record(z.string(), Subscription).optional() }).loose() })
  .loose();

export type SnapshotOutcome =
  | { kind: "snapshot"; event: DomainEvent; platformSubscriptionId: string | null }
  /** The subscriber has never purchased anything: nothing to reconcile. */
  | { kind: "none" }
  /** The provider's record is from the other environment (sandbox vs production): refuse to act on it. */
  | { kind: "environment_mismatch"; isSandbox: boolean }
  | { kind: "unparseable"; reason: string };

function storeOf(s: string | null | undefined): Store | null {
  const v = (s ?? "").toLowerCase();
  if (v === "app_store" || v === "mac_app_store") return "apple";
  if (v === "play_store") return "google";
  return null;
}
const when = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function subscriberToSnapshot(body: unknown, now: Date, expected: "production" | "sandbox"): SnapshotOutcome {
  const parsed = SubscriberResponse.safeParse(body);
  if (!parsed.success) return { kind: "unparseable", reason: "not a RevenueCat subscriber response" };
  const subs = Object.entries(parsed.data.subscriber.subscriptions ?? {})
    .map(([productId, s]) => ({ productId, s, store: storeOf(s.store), expires: when(s.expires_date) }))
    .filter((x) => x.store && x.expires);
  if (subs.length === 0) return { kind: "none" };

  // The subscription that ends last is the one that decides access.
  subs.sort((a, b) => b.expires!.getTime() - a.expires!.getTime());
  const { productId, s, store, expires } = subs[0];
  const isSandbox = s.is_sandbox === true;
  if (isSandbox !== (expected === "sandbox")) return { kind: "environment_mismatch", isSandbox };

  const purchase = when(s.purchase_date);
  const grace = when(s.grace_period_expires_date);
  const billingIssue = !!s.billing_issues_detected_at;
  const running = expires!.getTime() > now.getTime();
  const inGrace = billingIssue && !!grace && running;

  let state: EntitlementState;
  if (!running) state = "expired";
  else if (inGrace) state = "grace";
  else if ((s.period_type ?? "").toLowerCase() === "trial") state = "trialing";
  else state = "active";

  const isTrial = state === "trialing";
  return {
    kind: "snapshot",
    platformSubscriptionId: null, // the v1 subscriber object does not carry the original transaction id
    event: {
      provider: PROVIDER,
      occurredAt: now,
      store,
      productId,
      type: "snapshot",
      state,
      willRenew: running && !s.unsubscribe_detected_at && !billingIssue,
      trialStartedAt: isTrial ? purchase : null,
      trialEndsAt: isTrial ? expires : null,
      accessUntil: expires,
    },
  };
}

export class RevenueCatApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface FetchSubscriberOptions {
  secretApiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Reads RevenueCat's view of one subscriber. Throws RevenueCatApiError on a non-2xx answer. */
export async function fetchSubscriber(appUserId: string, opts: FetchSubscriberOptions): Promise<unknown> {
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await doFetch(`${opts.baseUrl ?? "https://api.revenuecat.com"}/v1/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: { Authorization: `Bearer ${opts.secretApiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new RevenueCatApiError(res.status, `RevenueCat subscriber lookup failed (HTTP ${res.status})`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
