/**
 * The financial-ledger WRITER. This is the only code that writes `subscriptions` / `payments` (migration 0021), and
 * it runs ONLY for an actual monetary charge (`PaidCharge`, amount > 0). A free trial produces access but never a
 * ledger row, so a trial-only user has no monetization history and stays eligible for Path A account deletion; the
 * first real charge is what creates the durable, RESTRICT-protected record that forces Path B.
 *
 * Idempotent by construction: `payments.external_transaction_id` is unique, so a redelivered webhook cannot create a
 * second payment. `subscriptions.first_paid_at` is written once (by the first charge) and the database trigger
 * refuses any later change to it. Payment rows are immutable facts; refunds are recorded in billing_events for now
 * (revenue_allocation_adjustments has no writer until the influencer/commission program exists).
 */
import type { Db } from "./db";
import type { EntitlementState } from "./entitlement";
import type { PaidCharge } from "./events";

export class LedgerConflictError extends Error {}

export interface LedgerWrite {
  subscriptionId: string;
  /** null when this exact transaction was already recorded (a duplicate delivery). */
  paymentId: string | null;
  duplicate: boolean;
}

export async function recordPaidCharge(db: Db, userId: string, c: PaidCharge): Promise<LedgerWrite> {
  if (!(c.amountMinor > 0) || !Number.isInteger(c.amountMinor)) {
    // Defence in depth: a $0 trial (or a bad amount) must never reach the ledger, whatever the caller did.
    throw new LedgerConflictError(`refusing to ledger a non-charge (amount ${c.amountMinor})`);
  }
  const [sub] = await db.query<{ id: string; user_id: string }>(
    `insert into subscriptions (user_id, platform, platform_subscription_id, plan, status, first_paid_at)
     values ($1, $2, $3, $4, 'active', $5)
     on conflict (platform_subscription_id) do update
       set updated_at = now(), first_paid_at = coalesce(subscriptions.first_paid_at, excluded.first_paid_at)
     returning id, user_id`,
    [userId, c.store, c.platformSubscriptionId, c.plan, c.occurredAt],
  );
  if (sub.user_id !== userId) {
    // The same store subscription already belongs to a different account (a transfer / restore onto another user).
    // Money must never silently move between accounts: fail loudly for a human.
    throw new LedgerConflictError(`subscription ${c.platformSubscriptionId} is already recorded for another account`);
  }
  const paid = await db.query<{ id: string }>(
    `insert into payments (subscription_id, user_id, external_transaction_id, platform, type, customer_paid_amount, currency, period_start, period_end, occurred_at, raw)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     on conflict (external_transaction_id) do nothing
     returning id`,
    [sub.id, userId, c.externalTransactionId, c.store, c.kind, c.amountMinor, c.currency, c.periodStart, c.periodEnd, c.occurredAt, JSON.stringify(c.raw)],
  );
  return { subscriptionId: sub.id, paymentId: paid[0]?.id ?? null, duplicate: paid.length === 0 };
}

const LEDGER_STATUS: Partial<Record<EntitlementState, string>> = {
  trialing: "trialing",
  active: "active",
  grace: "grace",
  expired: "cancelled",
  revoked: "cancelled",
};

/**
 * Mirrors the entitlement's state onto the ledger subscription, if one exists. A trial-only user has none, so this is
 * a no-op for them by design — it must never CREATE ledger history.
 */
export async function syncSubscriptionStatus(db: Db, platformSubscriptionId: string | null, state: EntitlementState): Promise<void> {
  const status = LEDGER_STATUS[state];
  if (!platformSubscriptionId || !status) return;
  await db.query(`update subscriptions set status = $2, updated_at = now() where platform_subscription_id = $1 and status <> $2`, [platformSubscriptionId, status]);
}
