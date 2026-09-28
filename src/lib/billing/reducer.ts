/**
 * The entitlement REDUCER: a pure, provider-neutral state machine. `reduce(current, event, now)` returns the next
 * entitlement fields and says whether the event was applied.
 *
 * It is the only place entitlement transitions are decided, so every path that can change access — a webhook, a
 * reconciliation pass, a restore — is subject to the same rules:
 *
 *  - ORDER. An event older than the last one applied never moves the entitlement backward (`stale`). Reconciliation
 *    snapshots follow the same rule, so a snapshot fetched at T supersedes any webhook that occurred before T.
 *  - NO DOWNGRADE BY REPLAY. A trial-start can never turn a paid subscription back into a trial.
 *  - ACCESS IS TIME-BOUNDED. Every entitled state carries `accessUntil`; nothing here grants open-ended access.
 *  - CANCELLATION IS NOT LOSS OF ACCESS. Turning auto-renew off keeps access until the period ends; only an
 *    expiration or a revocation (refund) ends it.
 *  - IDEMPOTENT. Re-applying the same event yields the same fields.
 *
 * Money and ledger history are NOT decided here (a charge is a fact recorded by ledger.ts); this layer only decides
 * what access the user has.
 */
import { ENTITLED_STATES, type EntitlementFields, type Price, type Store } from "./entitlement";
import type { DomainEvent } from "./events";

export interface ReduceResult {
  next: EntitlementFields;
  /** false when the event changed nothing (stale, redundant, or not applicable to the current state). */
  applied: boolean;
  reason: "applied" | "stale" | "noop";
}

const withEventClock = (e: EntitlementFields, at: Date): EntitlementFields => ({ ...e, lastProviderEventAt: at });
const later = (a: Date | null, b: Date): Date => (a && a.getTime() > b.getTime() ? a : b);

function identity(e: EntitlementFields, ev: DomainEvent): Partial<EntitlementFields> {
  const out: Partial<EntitlementFields> = { provider: ev.provider };
  if (ev.store) out.store = ev.store as Store;
  if (ev.productId) out.productId = ev.productId;
  return out;
}

function priceFields(price: Price | null | undefined): Partial<EntitlementFields> {
  return price ? { renewalPriceAmount: price.amount, renewalPriceCurrency: price.currency } : {};
}

export function reduce(current: EntitlementFields, ev: DomainEvent, now: Date): ReduceResult {
  // ORDER: an event strictly older than the last applied one cannot move state backward.
  if (current.lastProviderEventAt && ev.occurredAt.getTime() < current.lastProviderEventAt.getTime()) {
    return { next: current, applied: false, reason: "stale" };
  }
  // A no-op changes nothing, INCLUDING the ordering clock: if it advanced the clock, an event that carries real
  // information but happened EARLIER (delivered late) would then look stale and be lost — e.g. a cancellation that
  // arrives before the conversion it follows must not make that conversion stale.
  const noop = (): ReduceResult => ({ next: current, applied: false, reason: "noop" });
  const done = (patch: Partial<EntitlementFields>): ReduceResult => ({
    next: withEventClock({ ...current, ...identity(current, ev), ...patch }, ev.occurredAt),
    applied: true,
    reason: "applied",
  });
  const live = ENTITLED_STATES.includes(current.state);

  switch (ev.type) {
    case "trial_started": {
      // Never downgrade a paid (or grace) subscription, and never restart a trial that already ran.
      if (current.state === "active" || current.state === "grace") return noop();
      if (current.state === "trialing" && current.trialEndsAt?.getTime() === ev.trialEndsAt.getTime()) return noop();
      if (ev.trialEndsAt.getTime() <= now.getTime()) {
        // A trial that has already ended is history, not access.
        return done({ state: "expired", willRenew: false, trialStartedAt: current.trialStartedAt ?? ev.startedAt, trialEndsAt: ev.trialEndsAt, accessUntil: ev.trialEndsAt });
      }
      return done({
        state: "trialing",
        willRenew: ev.willRenew,
        trialStartedAt: current.trialStartedAt ?? ev.startedAt,
        trialEndsAt: ev.trialEndsAt,
        accessUntil: ev.trialEndsAt,
        ...priceFields(ev.renewalPrice),
      });
    }

    case "paid": {
      // A confirmed charge (initial purchase, renewal, or the trial's automatic conversion): active until the period ends.
      // Also recovery from grace. A period that has already ended is history, not access.
      if (ev.periodEnd.getTime() <= now.getTime()) {
        return live ? noop() : done({ state: "expired", willRenew: false, accessUntil: later(current.accessUntil, ev.periodEnd) });
      }
      return done({
        state: "active",
        willRenew: ev.willRenew,
        // The trial (if any) is over the moment a paid period begins; its end stays as history.
        accessUntil: ev.periodEnd,
        ...priceFields(ev.price),
      });
    }

    case "auto_renew_changed": {
      // Cancellation / un-cancellation. Access is untouched; only what happens at the end changes.
      if (!live) return noop();
      if (current.willRenew === ev.willRenew) return noop();
      return done({ willRenew: ev.willRenew });
    }

    case "billing_issue": {
      // A failed charge. With a grace period the user keeps access until it ends; without one nothing changes now
      // (the period already paid for still runs, and an expiration event ends access afterwards).
      if (current.state !== "active" && current.state !== "trialing") return noop();
      if (!ev.graceUntil) return noop();
      if (ev.graceUntil.getTime() <= now.getTime()) return done({ state: "expired", willRenew: false });
      return done({ state: "grace", accessUntil: ev.graceUntil });
    }

    case "expired": {
      if (current.state === "expired" || current.state === "revoked" || current.state === "none") return noop();
      return done({ state: "expired", willRenew: false });
    }

    case "revoked": {
      // A refund: access ends immediately, whatever the paid period said.
      if (current.state === "revoked" || current.state === "none") return noop();
      return done({ state: "revoked", willRenew: false, accessUntil: ev.occurredAt });
    }

    case "product_changed": {
      if (!ev.productId || !current.productId || current.productId === ev.productId) return noop();
      return done({ productId: ev.productId, ...priceFields(ev.renewalPrice) });
    }

    case "snapshot": {
      // Reconciliation / restore: the provider's own current view of the subscriber. It wins over any older event
      // (ordering already guaranteed above) and is the repair path for a missed or dropped webhook.
      const entitled = ev.state === "trialing" || ev.state === "active" || ev.state === "grace";
      const stillRunning = !!ev.accessUntil && ev.accessUntil.getTime() > now.getTime();
      const state = entitled && !stillRunning ? "expired" : ev.state;
      return {
        next: {
          ...withEventClock(current, ev.occurredAt),
          ...identity(current, ev),
          state,
          willRenew: state === "trialing" || state === "active" || state === "grace" ? ev.willRenew : false,
          trialStartedAt: ev.trialStartedAt ?? current.trialStartedAt,
          trialEndsAt: ev.trialEndsAt ?? current.trialEndsAt,
          accessUntil: ev.accessUntil ?? current.accessUntil,
          lastReconciledAt: ev.occurredAt,
          ...priceFields(ev.renewalPrice),
        },
        applied: true,
        reason: "applied",
      };
    }
  }
}
