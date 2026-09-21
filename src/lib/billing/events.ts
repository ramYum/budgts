/**
 * The provider-neutral vocabulary of the billing domain.
 *
 * A provider adapter (today: src/lib/billing/revenuecat/) translates whatever a provider sends into:
 *   - DomainEvent  — what happened to a user's ACCESS (consumed by the reducer), and
 *   - PaidCharge   — an actual monetary transaction (consumed by the ledger writer).
 * They are separate on purpose: a free trial is an access event with NO charge, so it never creates monetization
 * history; only a PaidCharge does. That is what keeps a trial-only user eligible for Path A account deletion.
 */
import type { EntitlementState, Price, Store } from "./entitlement";

interface EventBase {
  provider: string;
  /** The provider's own event time (the ordering key), not our receipt time. */
  occurredAt: Date;
  store: Store | null;
  productId: string | null;
}

export type DomainEvent = EventBase &
  (
    | { type: "trial_started"; startedAt: Date; trialEndsAt: Date; willRenew: boolean; renewalPrice?: Price | null }
    /** A confirmed charge: initial purchase, renewal, or the trial's automatic conversion. Recovery from grace too. */
    | { type: "paid"; kind: PaymentKind; periodEnd: Date; willRenew: boolean; price?: Price | null }
    /** Cancellation (auto-renew off) or un-cancellation. Never changes access by itself. */
    | { type: "auto_renew_changed"; willRenew: boolean }
    /** A failed charge. `graceUntil` null = the store gave no grace period. */
    | { type: "billing_issue"; graceUntil: Date | null }
    | { type: "expired" }
    /** A refund: access ends immediately. */
    | { type: "revoked" }
    | { type: "product_changed"; renewalPrice?: Price | null }
    /** The provider's full current view of the subscriber (reconciliation / restore). */
    | {
        type: "snapshot";
        state: EntitlementState;
        willRenew: boolean;
        trialStartedAt: Date | null;
        trialEndsAt: Date | null;
        accessUntil: Date | null;
        renewalPrice?: Price | null;
      }
  );

export type DomainEventType = DomainEvent["type"];
export type PaymentKind = "initial" | "renewal" | "trial_conversion";
export type Plan = "monthly" | "annual";

/**
 * An actual charge the platform confirmed, in integer minor units. Only amounts > 0 are charges: a $0 trial start is
 * not one, and must never be written to the ledger.
 */
export interface PaidCharge {
  provider: string;
  store: Store;
  /** The stable subscription identity (RevenueCat: original_transaction_id) -> subscriptions.platform_subscription_id. */
  platformSubscriptionId: string;
  plan: Plan;
  /** Idempotency key -> payments.external_transaction_id (unique). */
  externalTransactionId: string;
  kind: PaymentKind;
  amountMinor: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  occurredAt: Date;
  /** The provider payload, ALREADY REDACTED of personal data (the deletion design forbids retaining it). */
  raw: Record<string, unknown>;
}
