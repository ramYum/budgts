import { describe, expect, it } from "vitest";
import type { EntitlementView } from "./contract";
import { describeFlow, describeSubscription } from "./describe";

const base: EntitlementView = {
  hasPremium: false,
  status: "none",
  isTrial: false,
  willRenew: false,
  trialEndsAt: null,
  accessUntil: null,
  productId: null,
  store: null,
  canStartTrial: true,
  renewal: null,
};

// Mid-day UTC so the calendar day is the same in every realistic device time zone.
const OCT_5 = "2026-10-05T12:00:00.000Z";

describe("describeSubscription", () => {
  it("says the status is being checked before the server has answered", () => {
    expect(describeSubscription(null, false).headline).toBe("Checking your subscription…");
  });

  it("is honest when the status could not be loaded, and never guesses", () => {
    const d = describeSubscription(null, true);
    expect(d.headline).toBe("Subscription status unavailable");
    expect(d.detail).toMatch(/couldn't load/i);
  });

  it("describes a free trial that will convert, with the store price when known", () => {
    const d = describeSubscription(
      { ...base, hasPremium: true, status: "trialing", isTrial: true, willRenew: true, trialEndsAt: OCT_5, renewal: { amount: 999, currency: "USD" } },
      false,
    );
    expect(d.headline).toBe("Free trial");
    expect(d.detail).toMatch(/Oct(ober)? 5, 2026/);
    expect(d.detail).toContain("$9.99");
  });

  it("describes a cancelled trial: access continues, no charge", () => {
    const d = describeSubscription(
      { ...base, hasPremium: true, status: "trialing", isTrial: true, willRenew: false, trialEndsAt: OCT_5, accessUntil: OCT_5 },
      false,
    );
    expect(d.headline).toBe("Free trial (cancelled)");
    expect(d.detail).toMatch(/will not start/i);
  });

  it("describes active, cancelled-but-still-active, and a payment problem", () => {
    const active = { ...base, hasPremium: true, status: "active" as const, willRenew: true, accessUntil: OCT_5 };
    expect(describeSubscription(active, false).headline).toBe("Subscribed");
    expect(describeSubscription({ ...active, willRenew: false }, false).headline).toBe("Subscribed (cancelled)");
    const grace = describeSubscription({ ...active, status: "grace" }, false);
    expect(grace.headline).toBe("Payment problem");
    expect(grace.detail).toMatch(/Oct(ober)? 5, 2026/);
  });

  it("describes ended, refunded, and never-subscribed accounts", () => {
    expect(describeSubscription({ ...base, status: "expired" }, false).detail).toMatch(/has ended/i);
    expect(describeSubscription({ ...base, status: "revoked" }, false).detail).toMatch(/refunded/i);
    expect(describeSubscription(base, false).headline).toBe("No subscription");
  });
});

describe("describeFlow", () => {
  it("is silent while idle", () => {
    expect(describeFlow({ kind: "idle" })).toBeNull();
  });

  it("only celebrates a server-confirmed purchase", () => {
    expect(describeFlow({ kind: "premium", entitlement: { ...base, hasPremium: true } })).toMatchObject({ tone: "success" });
    const notConfirmed = describeFlow({ kind: "not_confirmed", entitlement: null });
    expect(notConfirmed).toMatchObject({ tone: "info" });
    expect(notConfirmed?.text).toMatch(/haven't been able to confirm/i);
  });

  it("covers pending, cancelled, nothing to restore and unavailable with plain language", () => {
    expect(describeFlow({ kind: "pending" })?.text).toMatch(/waiting for approval/i);
    expect(describeFlow({ kind: "cancelled" })?.text).toMatch(/cancelled/i);
    expect(describeFlow({ kind: "nothing_to_restore" })?.text).toMatch(/didn't find a purchase/i);
    expect(describeFlow({ kind: "unavailable" })).toMatchObject({ tone: "error" });
  });

  it("never shows the store SDK's raw error text", () => {
    const r = describeFlow({ kind: "error", message: "BillingClient: ITEM_UNAVAILABLE code=4 sku=budgts_monthly" });
    expect(r?.tone).toBe("error");
    expect(r?.text).not.toContain("ITEM_UNAVAILABLE");
  });
});
