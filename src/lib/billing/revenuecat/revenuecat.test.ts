import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { emptyEntitlement, hasPremium } from "../entitlement";
import { reduce } from "../reducer";
import { mapRevenueCatEvent, planFor, redactRevenueCatEvent, toMinorUnits, type MappedRevenueCatEvent } from "./map";
import { subscriberToSnapshot } from "./reconcile";
import { signRevenueCatBody, verifyRevenueCatWebhook } from "./verify";

const USER = "3f1c1d7e-6a52-4f1b-9d0a-0d6f2d5b7c11";
const T0 = Date.parse("2026-10-01T12:00:00Z");
const DAY = 86_400_000;

/** A documented RevenueCat webhook body (shape per "Event types and fields"), with overrides. */
const body = (event: Record<string, unknown>) => ({
  api_version: "1.0",
  event: {
    id: "evt-1",
    type: "INITIAL_PURCHASE",
    app_user_id: USER,
    original_app_user_id: "$RCAnonymousID:abc",
    aliases: ["$RCAnonymousID:abc", USER],
    app_id: "app123",
    environment: "PRODUCTION",
    event_timestamp_ms: T0,
    store: "APP_STORE",
    product_id: "budgts_monthly",
    period_type: "NORMAL",
    purchased_at_ms: T0,
    expiration_at_ms: T0 + 30 * DAY,
    price: 9.99,
    price_in_purchased_currency: 9.99,
    currency: "USD",
    transaction_id: "tx-1",
    original_transaction_id: "otx-1",
    country_code: "US",
    subscriber_attributes: { $email: { value: "someone@example.com", updated_at_ms: T0 } },
    ...event,
  },
});
const map = (event: Record<string, unknown>): MappedRevenueCatEvent => {
  const r = mapRevenueCatEvent(body(event));
  if (!r.ok) throw new Error(r.reason);
  return r.event;
};

describe("webhook authentication (fails closed, verified against RevenueCat's documented scheme)", () => {
  const SECRET = "whsec_test_signing_secret";
  const raw = JSON.stringify(body({}));
  const now = new Date(T0 + 60_000);
  const t = Math.floor(now.getTime() / 1000);
  const good = signRevenueCatBody(raw, SECRET, t);
  const base = { rawBody: raw, signatureHeader: good, authorizationHeader: null, signingSecret: SECRET, expectedAuthorization: null, now };

  it("accepts a correctly signed delivery", () => {
    expect(verifyRevenueCatWebhook(base)).toEqual({ ok: true });
  });

  it("uses HMAC-SHA256 over '<t>.<raw body>' exactly as RevenueCat documents (known-answer)", () => {
    // Independent computation of the documented scheme, not a call into our own signer.
    const expected = createHmac("sha256", "k").update(`1700000000.{"a":1}`).digest("hex");
    expect(signRevenueCatBody('{"a":1}', "k", 1700000000)).toBe(`t=1700000000,v1=${expected}`);
  });

  it("REFUSES everything when nothing is configured (never 'accept all')", () => {
    expect(verifyRevenueCatWebhook({ ...base, signingSecret: null, expectedAuthorization: null })).toEqual({ ok: false, reason: "not_configured" });
  });

  it("rejects a forged body, a tampered body, a wrong secret, a missing or malformed header", () => {
    expect(verifyRevenueCatWebhook({ ...base, rawBody: raw.replace("9.99", "0.01") })).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyRevenueCatWebhook({ ...base, signatureHeader: signRevenueCatBody(raw, "someone-elses-secret", t) })).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyRevenueCatWebhook({ ...base, signatureHeader: null })).toEqual({ ok: false, reason: "missing_signature" });
    expect(verifyRevenueCatWebhook({ ...base, signatureHeader: "garbage" })).toEqual({ ok: false, reason: "malformed_signature" });
    expect(verifyRevenueCatWebhook({ ...base, signatureHeader: `t=${t},v1=zz` })).toEqual({ ok: false, reason: "malformed_signature" });
  });

  it("rejects a replay outside the tolerance window, in either direction", () => {
    expect(verifyRevenueCatWebhook({ ...base, now: new Date(now.getTime() + 10 * 60_000) })).toEqual({ ok: false, reason: "stale_signature" });
    expect(verifyRevenueCatWebhook({ ...base, now: new Date(now.getTime() - 10 * 60_000) })).toEqual({ ok: false, reason: "stale_signature" });
  });

  it("when an Authorization value is configured it is mandatory (verbatim or as a Bearer token)", () => {
    const cfg = { ...base, expectedAuthorization: "s3cret-value" };
    expect(verifyRevenueCatWebhook({ ...cfg, authorizationHeader: null })).toEqual({ ok: false, reason: "bad_authorization" });
    expect(verifyRevenueCatWebhook({ ...cfg, authorizationHeader: "wrong" })).toEqual({ ok: false, reason: "bad_authorization" });
    expect(verifyRevenueCatWebhook({ ...cfg, authorizationHeader: "s3cret-value" })).toEqual({ ok: true });
    expect(verifyRevenueCatWebhook({ ...cfg, authorizationHeader: "Bearer s3cret-value" })).toEqual({ ok: true });
  });

  it("works with only an Authorization value configured (no signing secret)", () => {
    const only = { ...base, signingSecret: null, signatureHeader: null, expectedAuthorization: "s3cret-value" };
    expect(verifyRevenueCatWebhook({ ...only, authorizationHeader: "s3cret-value" })).toEqual({ ok: true });
    expect(verifyRevenueCatWebhook({ ...only, authorizationHeader: "nope" })).toEqual({ ok: false, reason: "bad_authorization" });
  });
});

describe("identity comes from the provider payload, never from the request", () => {
  it("app_user_id is our user id when it is a UUID; an anonymous RevenueCat id is unknown (recorded, not applied)", () => {
    expect(map({}).userId).toBe(USER);
    expect(map({ app_user_id: "$RCAnonymousID:8f2a" }).userId).toBeNull();
    expect(map({ app_user_id: "not-a-uuid" }).userId).toBeNull();
    expect(map({ app_user_id: USER.toUpperCase() }).userId).toBe(USER); // normalised
  });

  it("rejects a payload that is not a RevenueCat event at all", () => {
    expect(mapRevenueCatEvent({ hello: "world" }).ok).toBe(false);
    expect(mapRevenueCatEvent(null).ok).toBe(false);
    expect(mapRevenueCatEvent({ event: { id: "", type: "X", event_timestamp_ms: 1 } }).ok).toBe(false);
  });
});

describe("trial start is an ACCESS event with NO charge (it must never create ledger history)", () => {
  const trial = () => map({ id: "evt-trial", period_type: "TRIAL", price: 0, price_in_purchased_currency: 0, expiration_at_ms: T0 + 14 * DAY, product_id: "budgts_monthly" });

  it("maps a free-trial INITIAL_PURCHASE to trial_started and produces no PaidCharge", () => {
    const m = trial();
    expect(m.domain).toMatchObject({ type: "trial_started", willRenew: true });
    expect((m.domain as { trialEndsAt: Date }).trialEndsAt.getTime()).toBe(T0 + 14 * DAY);
    expect(m.charge).toBeNull();
    expect(m.chargeProblem).toBeNull();
  });

  it("drives the reducer to trialing with the event's authoritative end", () => {
    const m = trial();
    const r = reduce(emptyEntitlement(), m.domain!, new Date(T0));
    expect(r.next).toMatchObject({ state: "trialing", store: "apple", productId: "budgts_monthly" });
    expect(hasPremium(r.next, new Date(T0 + DAY))).toBe(true);
  });
});

describe("paid events produce a charge only when money actually moved", () => {
  it("a non-trial INITIAL_PURCHASE is an initial charge in integer minor units", () => {
    const m = map({});
    expect(m.domain).toMatchObject({ type: "paid", kind: "initial" });
    expect(m.charge).toMatchObject({ kind: "initial", amountMinor: 999, currency: "USD", plan: "monthly", externalTransactionId: "tx-1", platformSubscriptionId: "otx-1", store: "apple" });
  });

  it("the trial's automatic conversion (RENEWAL + is_trial_conversion) is a trial_conversion charge", () => {
    const m = map({ id: "evt-conv", type: "RENEWAL", is_trial_conversion: true, transaction_id: "tx-2", event_timestamp_ms: T0 + 14 * DAY, purchased_at_ms: T0 + 14 * DAY, expiration_at_ms: T0 + 44 * DAY });
    expect(m.domain).toMatchObject({ type: "paid", kind: "trial_conversion" });
    expect(m.charge).toMatchObject({ kind: "trial_conversion", amountMinor: 999, externalTransactionId: "tx-2" });
  });

  it("an ordinary RENEWAL is a renewal charge; a zero-price event is not a charge", () => {
    expect(map({ type: "RENEWAL", transaction_id: "tx-3" }).charge?.kind).toBe("renewal");
    const free = map({ type: "RENEWAL", price: 0, price_in_purchased_currency: 0, transaction_id: "tx-4" });
    expect(free.domain).toMatchObject({ type: "paid" });
    expect(free.charge).toBeNull();
  });

  it("uses the PURCHASED currency and its minor-unit exponent (JPY has none, KWD has three)", () => {
    expect(toMinorUnits(9.99, "USD")).toBe(999);
    expect(toMinorUnits(1500, "JPY")).toBe(1500);
    expect(toMinorUnits(3.5, "KWD")).toBe(3500);
    expect(map({ price: 1.2, price_in_purchased_currency: 1500, currency: "JPY" }).charge).toMatchObject({ amountMinor: 1500, currency: "JPY" });
  });

  it("an annual product is recognised by id or by period length; an unknowable plan FAILS LOUDLY instead of dropping money", () => {
    expect(planFor("budgts_annual", null, null)).toBe("annual");
    expect(planFor("com.budgts.pro", T0, T0 + 365 * DAY)).toBe("annual");
    expect(planFor("com.budgts.pro", T0, T0 + 30 * DAY)).toBe("monthly");
    const weird = map({ product_id: "mystery", expiration_at_ms: T0 + 90 * DAY });
    expect(weird.charge).toBeNull();
    expect(weird.chargeProblem).toMatch(/cannot tell the plan/);
  });

  it("a paid event lacking transaction ids cannot be ledgered and says so", () => {
    expect(map({ transaction_id: undefined }).chargeProblem).toMatch(/transaction ids/);
  });
});

describe("cancellation, billing issue, expiration, refund", () => {
  it("UNSUBSCRIBE cancels auto-renew only; UNCANCELLATION restores it", () => {
    expect(map({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE" }).domain).toMatchObject({ type: "auto_renew_changed", willRenew: false });
    expect(map({ type: "UNCANCELLATION" }).domain).toMatchObject({ type: "auto_renew_changed", willRenew: true });
  });

  it("a refund (CUSTOMER_SUPPORT) revokes; a BILLING_ERROR cancellation is left to BILLING_ISSUE", () => {
    expect(map({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" }).domain).toMatchObject({ type: "revoked" });
    const be = map({ type: "CANCELLATION", cancel_reason: "BILLING_ERROR" });
    expect(be.domain).toBeNull();
    expect(be.ignoredReason).toMatch(/BILLING_ISSUE/);
  });

  it("BILLING_ISSUE carries the grace expiry (or none), EXPIRATION expires, PRODUCT_CHANGE follows new_product_id", () => {
    expect(map({ type: "BILLING_ISSUE", grace_period_expiration_at_ms: T0 + 16 * DAY }).domain).toMatchObject({ type: "billing_issue" });
    expect((map({ type: "BILLING_ISSUE", grace_period_expiration_at_ms: null }).domain as { graceUntil: Date | null }).graceUntil).toBeNull();
    expect(map({ type: "EXPIRATION" }).domain).toMatchObject({ type: "expired" });
    expect(map({ type: "PRODUCT_CHANGE", product_id: "budgts_monthly", new_product_id: "budgts_annual" }).domain).toMatchObject({ type: "product_changed", productId: "budgts_annual" });
  });

  it("a full lifecycle through mapper + reducer: trial, conversion, cancel, expire", () => {
    let e = emptyEntitlement();
    const now = new Date(T0 + 60 * DAY);
    for (const ev of [
      map({ id: "1", period_type: "TRIAL", price: 0, price_in_purchased_currency: 0, expiration_at_ms: T0 + 14 * DAY }),
      map({ id: "2", type: "RENEWAL", is_trial_conversion: true, transaction_id: "tx-c", event_timestamp_ms: T0 + 14 * DAY, purchased_at_ms: T0 + 14 * DAY, expiration_at_ms: T0 + 44 * DAY }),
      map({ id: "3", type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", event_timestamp_ms: T0 + 20 * DAY }),
      map({ id: "4", type: "EXPIRATION", event_timestamp_ms: T0 + 44 * DAY }),
    ]) e = reduce(e, ev.domain!, now).next;
    expect(e.state).toBe("expired");
    expect(hasPremium(e, now)).toBe(false);
  });
});

describe("everything else is recorded, ignored, and flagged for reconciliation — never guessed", () => {
  it("unsupported stores (web billing is deferred), test events and unknown types", () => {
    expect(map({ store: "STRIPE" }).ignoredReason).toMatch(/unsupported store STRIPE/);
    expect(map({ store: "RC_BILLING" }).domain).toBeNull();
    expect(map({ type: "TEST" }).ignoredReason).toMatch(/test event/);
    const unknown = map({ type: "SOMETHING_NEW_FROM_REVENUECAT" });
    expect(unknown.domain).toBeNull();
    expect(unknown.needsReconcile).toBe(true);
  });

  it("transfers, pauses and refund reversals trigger reconciliation instead of a guess", () => {
    for (const type of ["TRANSFER", "SUBSCRIPTION_PAUSED", "REFUND_REVERSED", "TEMPORARY_ENTITLEMENT_GRANT"]) expect(map({ type }).needsReconcile).toBe(true);
  });

  it("SANDBOX vs PRODUCTION is read from the event; anything unrecognised is treated as sandbox", () => {
    expect(map({ environment: "PRODUCTION" }).environment).toBe("production");
    expect(map({ environment: "SANDBOX" }).environment).toBe("sandbox");
    expect(map({ environment: undefined }).environment).toBe("sandbox");
  });
});

describe("stored payloads are redacted by allow-list (no provider-supplied personal data is retained)", () => {
  it("drops subscriber attributes, aliases and the original (possibly anonymous) app user id", () => {
    const r = map({}).redactedPayload;
    expect(r).not.toHaveProperty("subscriber_attributes");
    expect(r).not.toHaveProperty("aliases");
    expect(r).not.toHaveProperty("original_app_user_id");
    expect(JSON.stringify(r)).not.toContain("someone@example.com");
    expect(r).toMatchObject({ id: "evt-1", type: "INITIAL_PURCHASE", product_id: "budgts_monthly", transaction_id: "tx-1" });
  });

  it("a field RevenueCat adds tomorrow is dropped, not retained", () => {
    expect(redactRevenueCatEvent({ id: "x", type: "T", brand_new_pii_field: "secret" })).toEqual({ id: "x", type: "T" });
  });
});

describe("reconciliation snapshot from the subscriber object", () => {
  const NOW = new Date(T0 + 20 * DAY);
  const sub = (over: Record<string, unknown>) => ({
    subscriber: { subscriptions: { budgts_monthly: { store: "app_store", is_sandbox: false, period_type: "normal", purchase_date: new Date(T0 + 14 * DAY).toISOString(), expires_date: new Date(T0 + 44 * DAY).toISOString(), unsubscribe_detected_at: null, billing_issues_detected_at: null, grace_period_expires_date: null, ...over } } },
  });

  it("an active paid subscriber", () => {
    const o = subscriberToSnapshot(sub({}), NOW, "production");
    expect(o.kind).toBe("snapshot");
    if (o.kind !== "snapshot") return;
    expect(o.event).toMatchObject({ type: "snapshot", state: "active", willRenew: true, store: "apple", productId: "budgts_monthly" });
    expect(reduce(emptyEntitlement(), o.event, NOW).next.state).toBe("active");
  });

  it("a trial, a cancelled subscriber, a grace period, and an expired subscriber", () => {
    const trial = subscriberToSnapshot(sub({ period_type: "trial", purchase_date: new Date(T0).toISOString(), expires_date: new Date(T0 + 14 * DAY + 10 * DAY).toISOString() }), NOW, "production");
    expect(trial.kind === "snapshot" && trial.event).toMatchObject({ state: "trialing" });
    const cancelled = subscriberToSnapshot(sub({ unsubscribe_detected_at: new Date(T0 + 18 * DAY).toISOString() }), NOW, "production");
    expect(cancelled.kind === "snapshot" && cancelled.event).toMatchObject({ state: "active", willRenew: false });
    const grace = subscriberToSnapshot(sub({ billing_issues_detected_at: new Date(NOW.getTime() - DAY).toISOString(), grace_period_expires_date: new Date(NOW.getTime() + 5 * DAY).toISOString(), expires_date: new Date(NOW.getTime() + 5 * DAY).toISOString() }), NOW, "production");
    expect(grace.kind === "snapshot" && grace.event).toMatchObject({ state: "grace", willRenew: false });
    const expired = subscriberToSnapshot(sub({ expires_date: new Date(T0 + 15 * DAY).toISOString() }), NOW, "production");
    expect(expired.kind === "snapshot" && expired.event).toMatchObject({ state: "expired", willRenew: false });
  });

  it("picks the subscription that ends last; a subscriber who never bought has nothing to reconcile", () => {
    const two = { subscriber: { subscriptions: { old: { store: "app_store", is_sandbox: false, expires_date: new Date(T0).toISOString() }, budgts_annual: { store: "play_store", is_sandbox: false, period_type: "normal", expires_date: new Date(T0 + 400 * DAY).toISOString() } } } };
    const o = subscriberToSnapshot(two, NOW, "production");
    expect(o.kind === "snapshot" && o.event).toMatchObject({ productId: "budgts_annual", store: "google", state: "active" });
    expect(subscriberToSnapshot({ subscriber: { subscriptions: {} } }, NOW, "production")).toEqual({ kind: "none" });
  });

  it("REFUSES a sandbox subscriber in production (and a production one in sandbox): environments never mix", () => {
    expect(subscriberToSnapshot(sub({ is_sandbox: true }), NOW, "production")).toEqual({ kind: "environment_mismatch", isSandbox: true });
    expect(subscriberToSnapshot(sub({ is_sandbox: false }), NOW, "sandbox")).toEqual({ kind: "environment_mismatch", isSandbox: false });
  });

  it("an unparseable response is reported, not trusted", () => {
    expect(subscriberToSnapshot({ nope: true }, NOW, "production").kind).toBe("unparseable");
  });
});
