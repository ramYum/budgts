/**
 * The trial-end REMINDER: provider-neutral scheduling and claim state. Budgts sends its OWN reminder about one day
 * before a trial converts to a paid subscription.
 *
 *  - TIMING comes from the authoritative `trial_ends_at` on the entitlement (never a client clock or a guess). A
 *    reminder is due in the 24 hours before the trial ends.
 *  - ONLY where it is true: the subscription must actually be about to begin, so a trial the user already cancelled
 *    (auto-renew off) gets no "your subscription will begin" message.
 *  - IDEMPOTENT + RACE-SAFE. `claimReminder` is one atomic UPDATE ... RETURNING guarded by a lease. Two workers
 *    racing for the same user: one wins and the other gets nothing. The claim records WHICH trial it is for, so the
 *    same trial is never reminded twice while a later (or extended) trial can be reminded again. A worker that
 *    crashes after claiming leaves an expiring lease, not a lost reminder.
 *  - FAILURE-SAFE. A delivery failure releases the claim so the next run retries; it never touches the entitlement's
 *    access state or any billing record — only the reminder bookkeeping columns.
 *  - NO PROVIDER YET. There is no notification channel in the repo (no email/push vendor). `runReminderSweep`
 *    therefore takes an injected `ReminderDelivery`; with none configured it reports what is due WITHOUT claiming,
 *    so nothing is silently consumed. Choosing a channel is an owner decision (docs/specs/2026-09-21-v1-monetization-design.md).
 */
import type { Db } from "./db";
import type { EntitlementFields, Price, Store } from "./entitlement";
import { planFor } from "./revenuecat/map";
import type { Plan } from "./events";

export const REMINDER_LEAD_MS = 24 * 3_600_000;
export const CLAIM_LEASE_MS = 15 * 60_000;

/** Everything a delivery adapter needs. Deliberately free of any provider vocabulary. */
export interface ReminderPayload {
  userId: string;
  trialEndsAt: Date;
  productId: string | null;
  store: Store | null;
  renewalPrice: Price | null;
}

/** The delivery port. An adapter (email, push, ...) implements this; none exists yet. */
export interface ReminderDelivery {
  deliver(payload: ReminderPayload): Promise<void>;
}

/**
 * Pure mirror of the claim predicate below, for tests and for UI/status reasoning. `claimReminder` is authoritative
 * (it decides inside the database, atomically); a test proves the two agree.
 */
export function isReminderDue(e: EntitlementFields, now: Date, leaseMs = CLAIM_LEASE_MS): boolean {
  if (e.state !== "trialing" || !e.willRenew || !e.trialEndsAt) return false;
  const untilEnd = e.trialEndsAt.getTime() - now.getTime();
  if (!(untilEnd > 0 && untilEnd <= REMINDER_LEAD_MS)) return false;
  const sameTrial = e.reminderForTrialEndsAt?.getTime() === e.trialEndsAt.getTime();
  if (sameTrial && e.reminderSentAt) return false; // already reminded for this trial
  if (sameTrial && e.reminderClaimedAt && e.reminderClaimedAt.getTime() >= now.getTime() - leaseMs) return false; // someone holds the lease
  return true;
}

const DUE_WHERE = `
  state = 'trialing' and will_renew and trial_ends_at is not null
  and trial_ends_at > $1::timestamptz and trial_ends_at <= $1::timestamptz + interval '24 hours'
  and not (reminder_for_trial_ends_at is not distinct from trial_ends_at and reminder_sent_at is not null)
  and (reminder_for_trial_ends_at is distinct from trial_ends_at
       or reminder_claimed_at is null
       or reminder_claimed_at < $1::timestamptz - interval '15 minutes')`;

/** Users whose reminder is due right now (a read; claiming is separate and atomic). */
export async function findDueReminderUserIds(db: Db, now: Date, limit = 100): Promise<string[]> {
  const rows = await db.query<{ user_id: string }>(
    `select user_id from entitlements where ${DUE_WHERE} order by trial_ends_at limit $2`,
    [now, limit],
  );
  return rows.map((r) => r.user_id);
}

/**
 * Atomically claims the reminder for one user. Returns the payload if THIS caller won the claim, or null if it is not
 * due, already sent, or another worker holds it. Safe to call from many workers at once.
 */
export async function claimReminder(db: Db, userId: string, now: Date): Promise<ReminderPayload | null> {
  const rows = await db.query<{ user_id: string; trial_ends_at: Date; product_id: string | null; store: Store | null; renewal_price_amount: number | null; renewal_price_currency: string | null }>(
    `update entitlements set
        reminder_sent_at = case when reminder_for_trial_ends_at is not distinct from trial_ends_at then reminder_sent_at else null end,
        reminder_for_trial_ends_at = trial_ends_at,
        reminder_claimed_at = $1::timestamptz,
        updated_at = now()
      where user_id = $2 and ${DUE_WHERE}
      returning user_id, trial_ends_at, product_id, store, renewal_price_amount, renewal_price_currency`,
    [now, userId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    userId: r.user_id,
    trialEndsAt: r.trial_ends_at instanceof Date ? r.trial_ends_at : new Date(r.trial_ends_at),
    productId: r.product_id,
    store: r.store,
    renewalPrice: r.renewal_price_amount !== null && r.renewal_price_currency ? { amount: r.renewal_price_amount, currency: r.renewal_price_currency } : null,
  };
}

/** Records that the reminder for this trial actually went out. */
export async function markReminderSent(db: Db, userId: string, trialEndsAt: Date, now: Date): Promise<void> {
  await db.query(`update entitlements set reminder_sent_at = $3, updated_at = now() where user_id = $1 and reminder_for_trial_ends_at = $2`, [userId, trialEndsAt, now]);
}

/** Gives the claim back after a failed delivery so the next run retries. Never touches access state. */
export async function releaseReminderClaim(db: Db, userId: string, trialEndsAt: Date): Promise<void> {
  await db.query(
    `update entitlements set reminder_claimed_at = null, updated_at = now() where user_id = $1 and reminder_for_trial_ends_at = $2 and reminder_sent_at is null`,
    [userId, trialEndsAt],
  );
}

const PERIOD_WORD: Record<Plan, string> = { monthly: "month", annual: "year" };

export function formatPrice(p: Price): string {
  const exp = (() => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      return 2;
    }
  })();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency }).format(p.amount / 10 ** exp);
  } catch {
    return `${(p.amount / 10 ** exp).toFixed(exp)} ${p.currency}`;
  }
}

/**
 * The reminder copy (owner-approved wording). The price comes from what the provider reported; when it did not say,
 * the message points at the store's own price instead of inventing one.
 */
export function composeTrialEndReminder(p: ReminderPayload): { title: string; body: string } {
  const plan = planFor(p.productId, null, null);
  const per = plan ? ` per ${PERIOD_WORD[plan]}` : "";
  const at = p.renewalPrice ? `${formatPrice(p.renewalPrice)}${per}` : "the price shown in your store";
  const where = p.store === "google" ? "Google Play" : p.store === "apple" ? "the App Store" : "your store subscription settings";
  return {
    title: "Your free trial ends tomorrow",
    body: `Your free trial ends tomorrow. Your subscription will automatically begin at ${at} unless you cancel before then. You can manage or cancel in ${where}.`,
  };
}

export interface SweepResult {
  due: number;
  claimed: number;
  sent: number;
  failed: number;
  delivery: "configured" | "unconfigured";
}

export async function runReminderSweep(deps: { db: Db; delivery: ReminderDelivery | null; now?: () => Date; limit?: number }): Promise<SweepResult> {
  const now = (deps.now ?? (() => new Date()))();
  const ids = await findDueReminderUserIds(deps.db, now, deps.limit ?? 100);
  if (!deps.delivery) return { due: ids.length, claimed: 0, sent: 0, failed: 0, delivery: "unconfigured" }; // claim nothing: never consume a reminder we cannot send
  let claimed = 0;
  let sent = 0;
  let failed = 0;
  for (const id of ids) {
    const payload = await claimReminder(deps.db, id, now);
    if (!payload) continue; // another worker got it, or it is no longer due
    claimed++;
    try {
      await deps.delivery.deliver(payload);
      await markReminderSent(deps.db, id, payload.trialEndsAt, now);
      sent++;
    } catch {
      failed++;
      await releaseReminderClaim(deps.db, id, payload.trialEndsAt).catch(() => {});
    }
  }
  return { due: ids.length, claimed, sent, failed, delivery: "configured" };
}

