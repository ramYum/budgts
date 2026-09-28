/**
 * RevenueCat webhook event -> Budgts domain vocabulary. This file (with reconcile.ts) is the ONLY place that knows
 * RevenueCat's event types and fields; everything downstream sees a `DomainEvent` and an optional `PaidCharge`.
 * Field semantics were taken from RevenueCat's "Event types and fields" documentation:
 *
 *  - A FREE TRIAL start is `INITIAL_PURCHASE` with `period_type: TRIAL` and `price: 0`. It is an access event and
 *    NEVER a charge, so it produces no ledger history.
 *  - The trial's automatic conversion is `RENEWAL` with `is_trial_conversion: true` and a real price.
 *  - `CANCELLATION` mostly means auto-renew was turned OFF (`cancel_reason: UNSUBSCRIBE`); access continues until
 *    `EXPIRATION`. `CUSTOMER_SUPPORT` is a refund: access ends now. `BILLING_ERROR` is covered by `BILLING_ISSUE`.
 *  - `environment` is `SANDBOX` or `PRODUCTION`, determined by the store transaction, not by any setting of ours.
 *  - Unknown / new event types are tolerated (RevenueCat may add them without an API version bump): they are
 *    recorded, ignored, and flagged for reconciliation so the provider's own view repairs any drift.
 *
 * Only Apple and Google are supported in V1 (web billing is deferred): any other store is ignored.
 */
import { z } from "zod";
import type { Price, Store } from "../entitlement";
import type { DomainEvent, PaidCharge, PaymentKind, Plan } from "../events";

export const PROVIDER = "revenuecat";

const num = z.number().nullish();
const str = z.string().nullish();

const RcEvent = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    app_user_id: str,
    event_timestamp_ms: z.number(),
    environment: str,
    store: str,
    product_id: str,
    new_product_id: str,
    period_type: str,
    purchased_at_ms: num,
    expiration_at_ms: num,
    price: num,
    price_in_purchased_currency: num,
    currency: str,
    transaction_id: str,
    original_transaction_id: str,
    cancel_reason: str,
    expiration_reason: str,
    is_trial_conversion: z.boolean().nullish(),
    grace_period_expiration_at_ms: num,
  })
  .loose();

const RcPayload = z.object({ api_version: z.string().optional(), event: RcEvent }).loose();

export type RevenueCatEvent = z.infer<typeof RcEvent>;

/** Fields that are safe to retain. Everything else (subscriber_attributes, aliases, original_app_user_id, ...) is dropped. */
const RETAIN = [
  "id", "type", "app_user_id", "event_timestamp_ms", "environment", "store", "product_id", "new_product_id",
  "period_type", "purchased_at_ms", "expiration_at_ms", "price", "price_in_purchased_currency", "currency",
  "transaction_id", "original_transaction_id", "cancel_reason", "expiration_reason", "is_trial_conversion",
  "grace_period_expiration_at_ms", "presented_offering_id", "is_family_share", "tax_percentage",
  "commission_percentage", "takehome_percentage", "country_code", "offer_code",
] as const;

/** Allow-list redaction: the deletion design forbids keeping provider-supplied personal data. */
export function redactRevenueCatEvent(event: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of RETAIN) if (event[k] !== undefined) out[k] = event[k];
  return out;
}

export interface MappedRevenueCatEvent {
  providerEventId: string;
  eventType: string;
  environment: "production" | "sandbox";
  occurredAt: Date;
  appUserId: string | null;
  /** Our user id, when `app_user_id` is one (RevenueCat's app_user_id IS the Supabase user id). Null = unknown owner. */
  userId: string | null;
  /** The stable subscription identity, when the event carries one. */
  platformSubscriptionId: string | null;
  /** What happened to access; null when the event does not affect it. */
  domain: DomainEvent | null;
  /** An actual monetary charge; null for trial starts, cancellations, and every other non-charge event. */
  charge: PaidCharge | null;
  /** Set when a real charge could not be represented (e.g. unknown plan). The event must FAIL loudly, not drop money. */
  chargeProblem: string | null;
  /** The provider's own view should be fetched to repair possible drift (transfer, unknown type, refund reversal...). */
  needsReconcile: boolean;
  ignoredReason: string | null;
  redactedPayload: Record<string, unknown>;
}

export type ParseResult = { ok: true; event: MappedRevenueCatEvent } | { ok: false; reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function storeOf(s: string | null | undefined): Store | null {
  if (s === "APP_STORE" || s === "MAC_APP_STORE") return "apple";
  if (s === "PLAY_STORE") return "google";
  return null;
}

/** ISO 4217 minor-unit exponent (JPY 0, USD 2, KWD 3...). */
function exponent(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Provider money is a decimal in major units; the ledger is integer minor units. */
export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * 10 ** exponent(currency));
}

/**
 * monthly / annual. The product id is checked first; if it says neither (store product ids are still to be created),
 * the purchased period's own length decides. Null means "cannot tell" and is surfaced, never guessed.
 */
export function planFor(productId: string | null | undefined, purchasedMs: number | null | undefined, expirationMs: number | null | undefined): Plan | null {
  const id = (productId ?? "").toLowerCase();
  if (/(annual|year|yearly|12m)/.test(id)) return "annual";
  if (/(month|monthly|1m)/.test(id)) return "monthly";
  if (typeof purchasedMs === "number" && typeof expirationMs === "number" && expirationMs > purchasedMs) {
    const days = (expirationMs - purchasedMs) / 86_400_000;
    if (days >= 20 && days <= 45) return "monthly";
    if (days >= 300 && days <= 400) return "annual";
  }
  return null;
}

const date = (ms: number | null | undefined): Date | null => (typeof ms === "number" ? new Date(ms) : null);

export function mapRevenueCatEvent(body: unknown): ParseResult {
  const parsed = RcPayload.safeParse(body);
  if (!parsed.success) return { ok: false, reason: "not a RevenueCat webhook payload" };
  const e = parsed.data.event;

  const occurredAt = new Date(e.event_timestamp_ms);
  const store = storeOf(e.store);
  const appUserId = e.app_user_id ?? null;
  const userId = appUserId && UUID.test(appUserId) ? appUserId.toLowerCase() : null;
  const environment = e.environment === "PRODUCTION" ? "production" : "sandbox"; // unknown => the conservative one
  const productId = e.type === "PRODUCT_CHANGE" ? (e.new_product_id ?? e.product_id ?? null) : (e.product_id ?? null);

  const out: MappedRevenueCatEvent = {
    providerEventId: e.id,
    eventType: e.type,
    environment,
    occurredAt,
    appUserId,
    userId,
    platformSubscriptionId: e.original_transaction_id ?? null,
    domain: null,
    charge: null,
    chargeProblem: null,
    needsReconcile: false,
    ignoredReason: null,
    redactedPayload: redactRevenueCatEvent(e as Record<string, unknown>),
  };
  const ignore = (reason: string, reconcile = false): ParseResult => ({ ok: true, event: { ...out, ignoredReason: reason, needsReconcile: reconcile } });

  if (e.type === "TEST") return ignore("RevenueCat test event");
  if (!store) return ignore(`unsupported store ${e.store ?? "(none)"} — V1 handles Apple and Google only`);

  const base = { provider: PROVIDER, occurredAt, store, productId };
  const price = (): Price | null => {
    const cur = e.currency ?? (typeof e.price_in_purchased_currency === "number" ? null : "USD");
    const amount = typeof e.price_in_purchased_currency === "number" ? e.price_in_purchased_currency : e.price;
    if (typeof amount !== "number" || amount <= 0 || !cur) return null;
    return { amount: toMinorUnits(amount, cur), currency: cur.toUpperCase() };
  };
  const expiration = date(e.expiration_at_ms);
  const purchased = date(e.purchased_at_ms);

  switch (e.type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL": {
      if (!expiration) return ignore("purchase event without an expiration time");
      if (e.type === "INITIAL_PURCHASE" && e.period_type === "TRIAL") {
        // A free trial: access with no charge. NEVER a ledger row.
        return { ok: true, event: { ...out, domain: { ...base, type: "trial_started", startedAt: purchased ?? occurredAt, trialEndsAt: expiration, willRenew: true } } };
      }
      const kind: PaymentKind = e.type === "INITIAL_PURCHASE" ? "initial" : e.is_trial_conversion ? "trial_conversion" : "renewal";
      const p = price();
      const domain: DomainEvent = { ...base, type: "paid", kind, periodEnd: expiration, willRenew: true, price: p };
      let charge: PaidCharge | null = null;
      let chargeProblem: string | null = null;
      if (p) {
        const plan = planFor(e.product_id, e.purchased_at_ms, e.expiration_at_ms);
        if (!e.transaction_id || !e.original_transaction_id) chargeProblem = "a paid event without transaction ids cannot be recorded in the ledger";
        else if (!plan) chargeProblem = `cannot tell the plan (monthly/annual) of product ${e.product_id ?? "(none)"}`;
        else if (!purchased) chargeProblem = "a paid event without a purchase time cannot be recorded in the ledger";
        else {
          charge = {
            provider: PROVIDER, store, platformSubscriptionId: e.original_transaction_id, plan,
            externalTransactionId: e.transaction_id, kind, amountMinor: p.amount, currency: p.currency,
            periodStart: purchased, periodEnd: expiration, occurredAt, raw: out.redactedPayload,
          };
        }
      }
      return { ok: true, event: { ...out, domain, charge, chargeProblem } };
    }

    case "CANCELLATION": {
      if (e.cancel_reason === "CUSTOMER_SUPPORT") return { ok: true, event: { ...out, domain: { ...base, type: "revoked" } } };
      if (e.cancel_reason === "BILLING_ERROR") return ignore("billing error is handled by BILLING_ISSUE / EXPIRATION");
      return { ok: true, event: { ...out, domain: { ...base, type: "auto_renew_changed", willRenew: false } } };
    }
    case "UNCANCELLATION":
      return { ok: true, event: { ...out, domain: { ...base, type: "auto_renew_changed", willRenew: true } } };
    case "BILLING_ISSUE":
      return { ok: true, event: { ...out, domain: { ...base, type: "billing_issue", graceUntil: date(e.grace_period_expiration_at_ms) } } };
    case "EXPIRATION":
      return { ok: true, event: { ...out, domain: { ...base, type: "expired" } } };
    case "PRODUCT_CHANGE":
      return { ok: true, event: { ...out, domain: { ...base, type: "product_changed", renewalPrice: price() } } };
    case "SUBSCRIPTION_EXTENDED":
      // Access was extended (a goodwill extension, e.g. by support): it changes access, not money.
      if (!expiration) return ignore("extension event without an expiration time", true);
      return { ok: true, event: { ...out, domain: { ...base, type: "paid", kind: "renewal", periodEnd: expiration, willRenew: true, price: null } } };

    case "SUBSCRIPTION_PAUSED":
    case "TRANSFER":
    case "REFUND_REVERSED":
    case "TEMPORARY_ENTITLEMENT_GRANT":
      return ignore(`${e.type} is repaired by reconciliation, not mapped`, true);
    case "NON_RENEWING_PURCHASE":
    case "INVOICE_ISSUANCE":
      return ignore(`${e.type} is not part of the V1 subscription model`);
    default:
      return ignore(`unrecognised event type ${e.type}`, true);
  }
}
