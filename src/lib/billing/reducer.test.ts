import { describe, expect, it } from "vitest";
import { effectiveStatus, emptyEntitlement, hasPremium, toEntitlementView, type EntitlementFields } from "./entitlement";
import type { DomainEvent } from "./events";
import { reduce } from "./reducer";

const D = (iso: string) => new Date(iso);
const DAY = 86_400_000;
const T0 = D("2026-10-01T12:00:00Z"); // trial starts
const TRIAL_END = new Date(T0.getTime() + 14 * DAY);
const PERIOD_END = new Date(TRIAL_END.getTime() + 30 * DAY);

const base = { provider: "revenuecat", store: "apple" as const, productId: "budgts_monthly" };
const ev = (occurredAt: Date, e: Record<string, unknown>): DomainEvent => ({ ...base, occurredAt, ...e }) as DomainEvent;

const trialStarted = (at = T0) => ev(at, { type: "trial_started", startedAt: at, trialEndsAt: TRIAL_END, willRenew: true });
const paid = (at: Date, periodEnd: Date, kind = "renewal", extra: Record<string, unknown> = {}) =>
  ev(at, { type: "paid", kind, periodEnd, willRenew: true, ...extra });

/** Runs events in order and returns the final entitlement. */
function run(events: DomainEvent[], now: Date, from: EntitlementFields = emptyEntitlement()): EntitlementFields {
  return events.reduce((cur, e) => reduce(cur, e, now).next, from);
}

describe("trial start", () => {
  it("a user with nothing starts a trial: trialing, entitled until the trial's authoritative end", () => {
    const r = reduce(emptyEntitlement(), trialStarted(), T0);
    expect(r.applied).toBe(true);
    expect(r.next).toMatchObject({ state: "trialing", willRenew: true, trialEndsAt: TRIAL_END, accessUntil: TRIAL_END, trialStartedAt: T0, provider: "revenuecat", store: "apple", productId: "budgts_monthly" });
    expect(hasPremium(r.next, T0)).toBe(true);
    expect(hasPremium(r.next, new Date(TRIAL_END.getTime() - 1))).toBe(true);
    expect(hasPremium(r.next, TRIAL_END)).toBe(false); // access is time-bounded even if no expiration event ever arrives
  });

  it("records the renewal price the provider reported, and never invents one", () => {
    const withPrice = reduce(emptyEntitlement(), ev(T0, { type: "trial_started", startedAt: T0, trialEndsAt: TRIAL_END, willRenew: true, renewalPrice: { amount: 999, currency: "USD" } }), T0).next;
    expect(withPrice).toMatchObject({ renewalPriceAmount: 999, renewalPriceCurrency: "USD" });
    expect(reduce(emptyEntitlement(), trialStarted(), T0).next).toMatchObject({ renewalPriceAmount: null, renewalPriceCurrency: null });
  });

  it("a duplicate delivery of the same trial start is a no-op", () => {
    const once = reduce(emptyEntitlement(), trialStarted(), T0).next;
    const twice = reduce(once, trialStarted(), T0);
    expect(twice.applied).toBe(false);
    expect(twice.next).toEqual(once);
  });

  it("a trial that has already ended by the time we hear about it is history, not access", () => {
    const late = new Date(TRIAL_END.getTime() + DAY);
    const r = reduce(emptyEntitlement(), trialStarted(), late);
    expect(r.next.state).toBe("expired");
    expect(hasPremium(r.next, late)).toBe(false);
    expect(r.next.trialStartedAt).toEqual(T0);
  });

  it("a replayed trial start can never downgrade a paid subscription back to a trial", () => {
    const active = run([trialStarted(), paid(TRIAL_END, PERIOD_END, "trial_conversion")], TRIAL_END);
    const replay = reduce(active, trialStarted(new Date(TRIAL_END.getTime() + 1000)), TRIAL_END);
    expect(replay.applied).toBe(false);
    expect(replay.next.state).toBe("active");
  });
});

describe("trial cancellation", () => {
  it("cancelling during the trial turns auto-renew off but keeps access until the trial ends", () => {
    const cancelAt = new Date(T0.getTime() + 3 * DAY);
    const r = reduce(reduce(emptyEntitlement(), trialStarted(), T0).next, ev(cancelAt, { type: "auto_renew_changed", willRenew: false }), cancelAt);
    expect(r.applied).toBe(true);
    expect(r.next).toMatchObject({ state: "trialing", willRenew: false, accessUntil: TRIAL_END });
    expect(hasPremium(r.next, cancelAt)).toBe(true);
    expect(toEntitlementView(r.next, cancelAt)).toMatchObject({ hasPremium: true, isTrial: true, willRenew: false });
  });

  it("the trial then simply lapses: expiration ends access and nothing is charged", () => {
    const cancelAt = new Date(T0.getTime() + 3 * DAY);
    const end = run([trialStarted(), ev(cancelAt, { type: "auto_renew_changed", willRenew: false }), ev(TRIAL_END, { type: "expired" })], TRIAL_END);
    expect(end.state).toBe("expired");
    expect(hasPremium(end, TRIAL_END)).toBe(false);
  });

  it("un-cancelling restores auto-renew", () => {
    const t1 = new Date(T0.getTime() + 3 * DAY);
    const t2 = new Date(T0.getTime() + 4 * DAY);
    const end = run([trialStarted(), ev(t1, { type: "auto_renew_changed", willRenew: false }), ev(t2, { type: "auto_renew_changed", willRenew: true })], t2);
    expect(end.willRenew).toBe(true);
  });
});

describe("trial -> paid conversion and renewal", () => {
  it("the store's automatic conversion makes the subscription active until the paid period ends", () => {
    const r = reduce(reduce(emptyEntitlement(), trialStarted(), T0).next, paid(TRIAL_END, PERIOD_END, "trial_conversion", { price: { amount: 999, currency: "USD" } }), TRIAL_END);
    expect(r.next).toMatchObject({ state: "active", willRenew: true, accessUntil: PERIOD_END, renewalPriceAmount: 999, trialEndsAt: TRIAL_END /* kept as history */ });
    expect(hasPremium(r.next, PERIOD_END.getTime() > 0 ? new Date(TRIAL_END.getTime() + DAY) : TRIAL_END)).toBe(true);
  });

  it("a renewal extends access; a duplicate of the same renewal changes nothing further", () => {
    const active = run([trialStarted(), paid(TRIAL_END, PERIOD_END, "trial_conversion")], TRIAL_END);
    const next = new Date(PERIOD_END.getTime() + 30 * DAY);
    const renewed = reduce(active, paid(PERIOD_END, next), PERIOD_END);
    expect(renewed.next.accessUntil).toEqual(next);
    const dup = reduce(renewed.next, paid(PERIOD_END, next), PERIOD_END);
    expect(dup.next.accessUntil).toEqual(next);
    expect(dup.next.state).toBe("active");
  });

  it("a direct purchase with no trial goes straight to active", () => {
    const r = reduce(emptyEntitlement(), paid(T0, PERIOD_END, "initial"), T0);
    expect(r.next).toMatchObject({ state: "active", accessUntil: PERIOD_END, trialStartedAt: null });
  });

  it("a charge whose period has already ended grants nothing", () => {
    const stale = reduce(emptyEntitlement(), paid(T0, new Date(T0.getTime() - DAY), "renewal"), T0);
    expect(hasPremium(stale.next, T0)).toBe(false);
  });
});

describe("cancellation after paid conversion", () => {
  it("keeps access for the period already paid for, then expires", () => {
    const active = run([trialStarted(), paid(TRIAL_END, PERIOD_END, "trial_conversion")], TRIAL_END);
    const cancelAt = new Date(TRIAL_END.getTime() + 5 * DAY);
    const cancelled = reduce(active, ev(cancelAt, { type: "auto_renew_changed", willRenew: false }), cancelAt).next;
    expect(cancelled).toMatchObject({ state: "active", willRenew: false, accessUntil: PERIOD_END });
    expect(hasPremium(cancelled, new Date(PERIOD_END.getTime() - 1))).toBe(true);
    expect(hasPremium(cancelled, PERIOD_END)).toBe(false); // even with no expiration webhook
    expect(effectiveStatus(cancelled, new Date(PERIOD_END.getTime() + 1))).toBe("expired");
    const expired = reduce(cancelled, ev(PERIOD_END, { type: "expired" }), PERIOD_END).next;
    expect(expired.state).toBe("expired");
  });

  it("cancel / expire on an entitlement that is not live is a no-op", () => {
    const expired = run([trialStarted(), ev(TRIAL_END, { type: "expired" })], TRIAL_END);
    expect(reduce(expired, ev(new Date(TRIAL_END.getTime() + 1000), { type: "auto_renew_changed", willRenew: false }), TRIAL_END).applied).toBe(false);
    expect(reduce(expired, ev(new Date(TRIAL_END.getTime() + 2000), { type: "expired" }), TRIAL_END).applied).toBe(false);
  });
});

describe("billing issue / grace, and recovery", () => {
  const active = () => run([trialStarted(), paid(TRIAL_END, PERIOD_END, "trial_conversion")], TRIAL_END);

  it("with a grace period, access continues until the grace period ends", () => {
    const issueAt = new Date(PERIOD_END.getTime());
    const graceUntil = new Date(issueAt.getTime() + 16 * DAY);
    const r = reduce(active(), ev(issueAt, { type: "billing_issue", graceUntil }), issueAt);
    expect(r.next).toMatchObject({ state: "grace", accessUntil: graceUntil });
    expect(hasPremium(r.next, new Date(issueAt.getTime() + 10 * DAY))).toBe(true);
    expect(hasPremium(r.next, graceUntil)).toBe(false);
  });

  it("recovery: a successful charge during grace returns to active", () => {
    const issueAt = PERIOD_END;
    const graceUntil = new Date(issueAt.getTime() + 16 * DAY);
    const inGrace = reduce(active(), ev(issueAt, { type: "billing_issue", graceUntil }), issueAt).next;
    const recoverAt = new Date(issueAt.getTime() + 2 * DAY);
    const nextEnd = new Date(recoverAt.getTime() + 30 * DAY);
    const r = reduce(inGrace, paid(recoverAt, nextEnd), recoverAt);
    expect(r.next).toMatchObject({ state: "active", accessUntil: nextEnd });
  });

  it("grace that runs out without recovery ends in expiration", () => {
    const issueAt = PERIOD_END;
    const graceUntil = new Date(issueAt.getTime() + 16 * DAY);
    const inGrace = reduce(active(), ev(issueAt, { type: "billing_issue", graceUntil }), issueAt).next;
    const r = reduce(inGrace, ev(graceUntil, { type: "expired" }), graceUntil);
    expect(r.next.state).toBe("expired");
  });

  it("no grace period from the store: state is unchanged (the paid period still runs, expiration ends it)", () => {
    const r = reduce(active(), ev(new Date(TRIAL_END.getTime() + 1000), { type: "billing_issue", graceUntil: null }), TRIAL_END);
    expect(r.applied).toBe(false);
    expect(r.next.state).toBe("active");
  });
});

describe("refund / revocation", () => {
  it("a refund ends access immediately, even inside a paid period", () => {
    const active = run([trialStarted(), paid(TRIAL_END, PERIOD_END, "trial_conversion")], TRIAL_END);
    const refundAt = new Date(TRIAL_END.getTime() + 2 * DAY);
    const r = reduce(active, ev(refundAt, { type: "revoked" }), refundAt);
    expect(r.next).toMatchObject({ state: "revoked", willRenew: false, accessUntil: refundAt });
    expect(hasPremium(r.next, refundAt)).toBe(false);
  });

  it("a revoked subscription can be entitled again by a genuinely later purchase", () => {
    const revoked = run([ev(T0, { type: "revoked" })], T0, { ...emptyEntitlement(), state: "active", accessUntil: PERIOD_END });
    const again = reduce(revoked, paid(new Date(T0.getTime() + DAY), PERIOD_END, "initial"), new Date(T0.getTime() + DAY));
    expect(again.next.state).toBe("active");
  });
});

describe("out-of-order and duplicate delivery", () => {
  it("an event older than the last applied one never moves the entitlement backward", () => {
    const active = run([trialStarted(), paid(TRIAL_END, PERIOD_END, "trial_conversion")], TRIAL_END);
    // A late-arriving cancellation from BEFORE the conversion, and a late trial start from before that:
    const lateCancel = reduce(active, ev(new Date(TRIAL_END.getTime() - DAY), { type: "auto_renew_changed", willRenew: false }), TRIAL_END);
    expect(lateCancel).toMatchObject({ applied: false, reason: "stale" });
    expect(lateCancel.next).toEqual(active);
    const lateTrial = reduce(active, trialStarted(new Date(T0.getTime() - DAY)), TRIAL_END);
    expect(lateTrial.reason).toBe("stale");
  });

  it("an out-of-order EXPIRATION from before a renewal cannot kill the renewed subscription", () => {
    const active = run([trialStarted(), paid(TRIAL_END, PERIOD_END, "trial_conversion")], TRIAL_END);
    const renewedAt = PERIOD_END;
    const nextEnd = new Date(PERIOD_END.getTime() + 30 * DAY);
    const renewed = reduce(active, paid(renewedAt, nextEnd), renewedAt).next;
    const lateExpire = reduce(renewed, ev(new Date(renewedAt.getTime() - 1000), { type: "expired" }), renewedAt);
    expect(lateExpire.reason).toBe("stale");
    expect(lateExpire.next.state).toBe("active");
  });

  it("delivering the whole history twice (or shuffled between two workers) converges on the same entitlement", () => {
    const history = [trialStarted(), ev(new Date(T0.getTime() + 3 * DAY), { type: "auto_renew_changed", willRenew: false }), paid(TRIAL_END, PERIOD_END, "trial_conversion")];
    const once = run(history, PERIOD_END);
    const twice = run([...history, ...history], PERIOD_END);
    expect(twice).toEqual(once);
  });

  it("re-applying the same event is idempotent for every event type", () => {
    const events: DomainEvent[] = [
      trialStarted(),
      ev(new Date(T0.getTime() + DAY), { type: "auto_renew_changed", willRenew: false }),
      paid(TRIAL_END, PERIOD_END, "trial_conversion"),
      ev(new Date(TRIAL_END.getTime() + DAY), { type: "product_changed", productId: "budgts_annual" }),
    ];
    for (const e of events) {
      const cur = run(events.slice(0, events.indexOf(e)), PERIOD_END);
      const once = reduce(cur, e, PERIOD_END).next;
      expect(reduce(once, e, PERIOD_END).next).toEqual(once);
    }
  });
});

describe("restore / reconciliation snapshots", () => {
  const snapshot = (at: Date, over: Record<string, unknown> = {}): DomainEvent =>
    ev(at, { type: "snapshot", state: "active", willRenew: true, trialStartedAt: T0, trialEndsAt: TRIAL_END, accessUntil: PERIOD_END, ...over });

  it("repairs a MISSED webhook: the provider says active, we still show trialing", () => {
    const stuck = reduce(emptyEntitlement(), trialStarted(), T0).next;
    const at = new Date(TRIAL_END.getTime() + 3600_000);
    const r = reduce(stuck, snapshot(at), at);
    expect(r.next).toMatchObject({ state: "active", accessUntil: PERIOD_END, lastReconciledAt: at });
  });

  it("restore for a user we know nothing about (new device / lost row) rebuilds the entitlement", () => {
    const at = new Date(TRIAL_END.getTime() + DAY);
    const r = reduce(emptyEntitlement(), snapshot(at), at);
    expect(r.next).toMatchObject({ state: "active", accessUntil: PERIOD_END, provider: "revenuecat", trialStartedAt: T0 });
    expect(hasPremium(r.next, at)).toBe(true);
  });

  it("a snapshot that says entitled but whose access window has closed is expired, never granted", () => {
    const at = new Date(PERIOD_END.getTime() + DAY);
    const r = reduce(emptyEntitlement(), snapshot(at), at);
    expect(r.next.state).toBe("expired");
    expect(hasPremium(r.next, at)).toBe(false);
  });

  it("a snapshot older than the last applied event is stale and changes nothing", () => {
    const active = run([trialStarted(), paid(TRIAL_END, PERIOD_END, "trial_conversion")], TRIAL_END);
    const r = reduce(active, snapshot(new Date(T0.getTime() + DAY), { state: "trialing", accessUntil: TRIAL_END }), TRIAL_END);
    expect(r.reason).toBe("stale");
    expect(r.next.state).toBe("active");
  });

  it("a snapshot of an expired subscriber clears entitlement and auto-renew", () => {
    const active = run([trialStarted(), paid(TRIAL_END, PERIOD_END, "trial_conversion")], TRIAL_END);
    const at = new Date(PERIOD_END.getTime() + DAY);
    const r = reduce(active, snapshot(at, { state: "expired", willRenew: true }), at);
    expect(r.next).toMatchObject({ state: "expired", willRenew: false });
  });
});

describe("hasPremium and the view-model", () => {
  it("is false for a user with no row, and for none / expired / revoked", () => {
    expect(hasPremium(null)).toBe(false);
    expect(hasPremium(undefined)).toBe(false);
    for (const state of ["none", "expired", "revoked"] as const) {
      expect(hasPremium({ state, accessUntil: new Date(Date.now() + DAY) })).toBe(false);
    }
  });

  it("an entitled state WITHOUT an access window grants nothing", () => {
    expect(hasPremium({ state: "active", accessUntil: null }, T0)).toBe(false);
  });

  it("the view offers the trial only to an account that never had one", () => {
    expect(toEntitlementView(null, T0)).toMatchObject({ hasPremium: false, status: "none", canStartTrial: true, isTrial: false });
    const trial = reduce(emptyEntitlement(), trialStarted(), T0).next;
    expect(toEntitlementView(trial, T0)).toMatchObject({ hasPremium: true, status: "trialing", isTrial: true, canStartTrial: false, trialEndsAt: TRIAL_END.toISOString() });
    const lapsed = run([trialStarted(), ev(TRIAL_END, { type: "expired" })], TRIAL_END);
    expect(toEntitlementView(lapsed, TRIAL_END)).toMatchObject({ hasPremium: false, status: "expired", canStartTrial: false });
  });

  it("exposes only the stable view-model fields (no provider ids or reminder bookkeeping)", () => {
    const keys = Object.keys(toEntitlementView(reduce(emptyEntitlement(), trialStarted(), T0).next, T0)).sort();
    expect(keys).toEqual(["accessUntil", "canStartTrial", "hasPremium", "isTrial", "productId", "renewal", "status", "store", "trialEndsAt", "willRenew"]);
  });
});

describe("a no-op event must not make older, informative events look stale", () => {
  it("a cancellation delivered BEFORE the conversion it follows is a no-op that does not block the conversion", () => {
    const cancelAt = new Date(T0.getTime() + 20 * DAY);
    const conversionAt = TRIAL_END;
    // Delivery order is inverted: the later cancellation arrives while we know nothing about this user.
    const afterCancel = reduce(emptyEntitlement(), ev(cancelAt, { type: "auto_renew_changed", willRenew: false }), cancelAt);
    expect(afterCancel.applied).toBe(false);
    expect(afterCancel.next.lastProviderEventAt).toBeNull(); // the ordering clock did NOT move
    // ...so the earlier conversion is still applied, and the user has the access they paid for.
    const afterConversion = reduce(afterCancel.next, paid(conversionAt, PERIOD_END, "trial_conversion"), cancelAt);
    expect(afterConversion.reason).toBe("applied");
    expect(afterConversion.next).toMatchObject({ state: "active", accessUntil: PERIOD_END });
  });

  it("only an APPLIED event moves the ordering clock", () => {
    const t = new Date(T0.getTime() + DAY);
    expect(reduce(emptyEntitlement(), ev(t, { type: "expired" }), t).next.lastProviderEventAt).toBeNull();
    expect(reduce(emptyEntitlement(), trialStarted(t), t).next.lastProviderEventAt).toEqual(t);
  });
});
