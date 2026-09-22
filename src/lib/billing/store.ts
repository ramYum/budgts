/**
 * Persistence for the two billing tables: `entitlements` (current state, one row per user) and `billing_events`
 * (the idempotent, append-only provider event log). Every function takes a `Db`, and the processor passes a
 * TRANSACTION, so an event's ledger write, entitlement change and log entry commit together or not at all.
 */
import type { Db } from "./db";
import { emptyEntitlement, type Entitlement, type EntitlementFields, type EntitlementState, type Store } from "./entitlement";

type EntitlementRow = {
  user_id: string;
  state: EntitlementState;
  provider: string | null;
  store: Store | null;
  product_id: string | null;
  provider_customer_id: string | null;
  will_renew: boolean;
  trial_started_at: Date | null;
  trial_ends_at: Date | null;
  access_until: Date | null;
  last_provider_event_at: Date | null;
  last_reconciled_at: Date | null;
  renewal_price_amount: number | null;
  renewal_price_currency: string | null;
  reminder_for_trial_ends_at: Date | null;
  reminder_claimed_at: Date | null;
  reminder_sent_at: Date | null;
};

const d = (v: Date | string | null): Date | null => (v === null ? null : v instanceof Date ? v : new Date(v));

export function entitlementFromRow(r: EntitlementRow): Entitlement {
  return {
    userId: r.user_id,
    state: r.state,
    provider: r.provider,
    store: r.store,
    productId: r.product_id,
    providerCustomerId: r.provider_customer_id,
    willRenew: r.will_renew,
    trialStartedAt: d(r.trial_started_at),
    trialEndsAt: d(r.trial_ends_at),
    accessUntil: d(r.access_until),
    lastProviderEventAt: d(r.last_provider_event_at),
    lastReconciledAt: d(r.last_reconciled_at),
    renewalPriceAmount: r.renewal_price_amount,
    renewalPriceCurrency: r.renewal_price_currency,
    reminderForTrialEndsAt: d(r.reminder_for_trial_ends_at),
    reminderClaimedAt: d(r.reminder_claimed_at),
    reminderSentAt: d(r.reminder_sent_at),
  };
}

/** The user's entitlement, or null when they have no row (which means "never had anything"). No lock. */
export async function loadEntitlement(db: Db, userId: string): Promise<Entitlement | null> {
  const [row] = await db.query<EntitlementRow>(`select * from entitlements where user_id = $1`, [userId]);
  return row ? entitlementFromRow(row) : null;
}

/**
 * Loads the user's entitlement row LOCKED for the rest of the transaction, creating an empty ('none') one first if
 * they have none. Concurrent events for the same user therefore apply one at a time, in a consistent order.
 */
export async function lockEntitlement(db: Db, userId: string): Promise<Entitlement> {
  await db.query(`insert into entitlements (user_id) values ($1) on conflict (user_id) do nothing`, [userId]);
  const [row] = await db.query<EntitlementRow>(`select * from entitlements where user_id = $1 for update`, [userId]);
  return entitlementFromRow(row);
}

export async function saveEntitlement(db: Db, userId: string, f: EntitlementFields): Promise<void> {
  await db.query(
    `update entitlements set
       state = $2, provider = $3, store = $4, product_id = $5, provider_customer_id = $6, will_renew = $7,
       trial_started_at = $8, trial_ends_at = $9, access_until = $10, last_provider_event_at = $11,
       last_reconciled_at = $12, renewal_price_amount = $13, renewal_price_currency = $14, updated_at = now()
     where user_id = $1`,
    [
      userId, f.state, f.provider, f.store, f.productId, f.providerCustomerId, f.willRenew,
      f.trialStartedAt, f.trialEndsAt, f.accessUntil, f.lastProviderEventAt,
      f.lastReconciledAt, f.renewalPriceAmount, f.renewalPriceCurrency,
    ],
  );
}

export async function userExists(db: Db, userId: string): Promise<boolean> {
  const [r] = await db.query<{ e: boolean }>(`select exists (select 1 from auth.users where id = $1) as e`, [userId]);
  return r.e;
}

/** True while (or after) the account's deletion has started. New entitlement rows must not be created for it. */
export async function accountIsDeleting(db: Db, userId: string): Promise<boolean> {
  const [r] = await db.query<{ e: boolean }>(`select exists (select 1 from account_deletions where user_id = $1) as e`, [userId]);
  return r.e;
}

export { emptyEntitlement };

// ---------------------------------------------------------------------------------------------------------------------
// billing_events

export type BillingEventStatus = "received" | "processed" | "ignored" | "quarantined" | "failed";
const TERMINAL: readonly BillingEventStatus[] = ["processed", "ignored", "quarantined"];

export interface EventIdentity {
  provider: string;
  providerEventId: string;
  eventType: string;
  /** Null when the event names no known user; the FK would otherwise refuse the row. */
  userId: string | null;
  appUserId: string | null;
  environment: "production" | "sandbox";
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export interface RecordedEvent {
  id: string;
  status: BillingEventStatus;
  /** false when this provider event id was already on file (a duplicate or a retry). */
  inserted: boolean;
  /** true when the earlier delivery reached a terminal outcome: nothing left to do. */
  alreadyHandled: boolean;
}

/**
 * Idempotently logs a delivery. The unique (provider, provider_event_id) index is the guard: a duplicate delivery
 * finds the existing row. A duplicate whose earlier attempt FAILED is handed back for reprocessing; a duplicate whose
 * earlier attempt reached a terminal state is `alreadyHandled` and must do nothing.
 */
export async function recordEvent(db: Db, e: EventIdentity): Promise<RecordedEvent> {
  const inserted = await db.query<{ id: string; status: BillingEventStatus }>(
    `insert into billing_events (provider, provider_event_id, event_type, user_id, app_user_id, environment, occurred_at, payload)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     on conflict (provider, provider_event_id) do nothing
     returning id, status`,
    [e.provider, e.providerEventId, e.eventType, e.userId, e.appUserId, e.environment, e.occurredAt, JSON.stringify(e.payload)],
  );
  if (inserted[0]) return { id: inserted[0].id, status: inserted[0].status, inserted: true, alreadyHandled: false };
  const [existing] = await db.query<{ id: string; status: BillingEventStatus }>(
    `select id, status from billing_events where provider = $1 and provider_event_id = $2 for update`,
    [e.provider, e.providerEventId],
  );
  return { id: existing.id, status: existing.status, inserted: false, alreadyHandled: TERMINAL.includes(existing.status) };
}

export async function finishEvent(
  db: Db,
  id: string,
  outcome: { status: Exclude<BillingEventStatus, "received">; internalType?: string | null; error?: string | null },
): Promise<void> {
  await db.query(
    `update billing_events set status = $2, internal_type = coalesce($3, internal_type), error = $4,
       processed_at = now(), attempts = attempts + 1 where id = $1`,
    [id, outcome.status, outcome.internalType ?? null, outcome.error ?? null],
  );
}

/**
 * Records that processing an event FAILED (its transaction rolled back), so the failure is visible and a redelivery
 * finds it. A row already at a terminal status is never touched (the immutability trigger would refuse it anyway).
 */
export async function recordFailure(db: Db, e: EventIdentity, error: string): Promise<void> {
  await db.query(
    `insert into billing_events (provider, provider_event_id, event_type, user_id, app_user_id, environment, occurred_at, payload, status, error, attempts)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'failed', $9, 1)
     on conflict (provider, provider_event_id) do update
       set status = 'failed', error = excluded.error, attempts = billing_events.attempts + 1
       where billing_events.status in ('received', 'failed')`,
    [e.provider, e.providerEventId, e.eventType, e.userId, e.appUserId, e.environment, e.occurredAt, JSON.stringify(e.payload), error.slice(0, 500)],
  );
}
