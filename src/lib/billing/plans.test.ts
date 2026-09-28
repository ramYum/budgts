import { describe, expect, it } from "vitest";
import { billingLive, loadBillingConfig } from "./config";
import { SUBSCRIPTION_TERMS, formatPlanPrice } from "./plans";

describe("subscription terms", () => {
  it("are the launch plan: $9.99 a month, $69 a year, a 7-day trial", () => {
    expect(formatPlanPrice(SUBSCRIPTION_TERMS.monthlyMinor)).toBe("$9.99");
    expect(formatPlanPrice(SUBSCRIPTION_TERMS.annualMinor)).toBe("$69");
    expect(SUBSCRIPTION_TERMS.trialDays).toBe(7);
  });
  it("prints whole prices without cents and refuses non-integers", () => {
    expect(formatPlanPrice(7900)).toBe("$79");
    expect(() => formatPlanPrice(9.99)).toThrow();
  });
});

describe("billingLive", () => {
  it("is off without configuration, in sandbox, or without the webhook signing secret", () => {
    expect(billingLive(loadBillingConfig({}))).toBe(false);
    expect(billingLive(loadBillingConfig({ REVENUECAT_WEBHOOK_SIGNING_SECRET: "s", BILLING_ENVIRONMENT: "sandbox" }))).toBe(false);
    expect(billingLive(loadBillingConfig({ BILLING_ENVIRONMENT: "production" }))).toBe(false);
  });
  it("is on for a production deployment that can verify store events", () => {
    expect(billingLive(loadBillingConfig({ REVENUECAT_WEBHOOK_SIGNING_SECRET: "s", BILLING_ENVIRONMENT: "production" }))).toBe(true);
  });
});
