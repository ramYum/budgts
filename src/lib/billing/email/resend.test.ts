// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { loadBillingConfig, type BillingConfig } from "../config";
import type { Db } from "../db";
import { APPLE_MANAGE_URL, GOOGLE_MANAGE_URL, MANAGE_STORE_LINKS, manageSubscriptionPageUrl, manageUrlFor, DELETION_SUBSCRIPTION_NOTICE } from "../manage";
import type { ReminderPayload } from "../reminders";
import { composeReminderEmail, createResendReminderDelivery, recipientAllowed, ReminderUndeliverableError } from "./resend";

const payload: ReminderPayload = { userId: "11111111-1111-4111-8111-111111111111", trialEndsAt: new Date("2026-10-15T12:00:00Z"), productId: "budgts_monthly", store: "apple", renewalPrice: { amount: 999, currency: "USD" } };
const config = (over: Partial<BillingConfig> = {}): BillingConfig => ({ ...loadBillingConfig({}), resendApiKey: "re_test_key", emailFrom: "Budgts <reminders@example.test>", siteUrl: "https://staging.example.test", environment: "sandbox", reminderEmailAllowlist: ["@example.test"], ...over });
const dbWith = (email: string | null): Db => ({ query: async () => [{ email }] as never, transaction: async (fn) => fn(dbWith(email)) });
const okFetch = () => vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));

describe("manage-subscription links", () => {
  it("point at the stores' own pages; a page link works with no sign-in", () => {
    expect(APPLE_MANAGE_URL).toBe("https://apps.apple.com/account/subscriptions");
    expect(GOOGLE_MANAGE_URL).toBe("https://play.google.com/store/account/subscriptions?package=com.budgts.app");
    expect(manageUrlFor("apple")).toBe(APPLE_MANAGE_URL);
    expect(manageUrlFor("google")).toBe(GOOGLE_MANAGE_URL);
    expect(manageUrlFor(null)).toBeNull();
    expect(MANAGE_STORE_LINKS.map((l) => l.store)).toEqual(["apple", "google"]);
    expect(manageSubscriptionPageUrl("https://budgts.com/")).toBe("https://budgts.com/manage-subscription");
    expect(manageSubscriptionPageUrl("https://budgts.com", "google")).toBe("https://budgts.com/manage-subscription?store=google");
  });
  it("uses the owner-approved deletion notice verbatim", () => {
    expect(DELETION_SUBSCRIPTION_NOTICE).toBe("Deleting your Budgts account does not automatically cancel your App Store or Google Play subscription.");
  });
});

describe("the reminder email", () => {
  it("carries the approved wording, the real price and period, and a working manage link (text and HTML)", () => {
    const m = composeReminderEmail(payload, "https://budgts.com");
    expect(m.subject).toBe("Your free trial ends tomorrow");
    expect(m.text).toContain("Your free trial ends tomorrow. Your subscription will automatically begin at $9.99 per month unless you cancel before then.");
    expect(m.manageUrl).toBe("https://budgts.com/manage-subscription?store=apple");
    expect(m.text).toContain(m.manageUrl);
    expect(m.text).toContain(APPLE_MANAGE_URL);
    expect(m.html).toContain(`href="${m.manageUrl}"`);
    expect(m.html).toContain("Manage subscription");
  });
  it("never invents a price and escapes everything it embeds", () => {
    const m = composeReminderEmail({ ...payload, renewalPrice: null, store: "google" }, "https://budgts.com");
    expect(m.text).toContain("the price shown in your store");
    expect(m.text).toContain(GOOGLE_MANAGE_URL);
    expect(composeReminderEmail(payload, 'https://x.test/"><script>').html).not.toContain("<script>");
  });
  it("is transactional: no marketing or promotional content", () => {
    const m = composeReminderEmail(payload, "https://budgts.com");
    expect(m.html + m.text).not.toMatch(/upgrade now|limited time|discount|% off|promo|newsletter/i);
  });
});

describe("sandbox safety: real customer email is never sent from a non-production deployment", () => {
  it("production reaches everyone; a sandbox only matches its allow-list (address or @domain)", () => {
    expect(recipientAllowed("anyone@gmail.com", { environment: "production", reminderEmailAllowlist: [] })).toBe(true);
    expect(recipientAllowed("anyone@gmail.com", { environment: "sandbox", reminderEmailAllowlist: [] })).toBe(false);
    expect(recipientAllowed("Owner@Gmail.com", { environment: "sandbox", reminderEmailAllowlist: ["owner@gmail.com"] })).toBe(true);
    expect(recipientAllowed("qa@example.test", { environment: "sandbox", reminderEmailAllowlist: ["@example.test"] })).toBe(true);
    expect(recipientAllowed("qa@evil-example.test", { environment: "sandbox", reminderEmailAllowlist: ["@example.test"] })).toBe(false);
  });
});

describe("Resend delivery", () => {
  it("is null (no channel) without an API key or a sender", () => {
    expect(createResendReminderDelivery({ db: dbWith("a@example.test"), config: config({ resendApiKey: null }) })).toBeNull();
    expect(createResendReminderDelivery({ db: dbWith("a@example.test"), config: config({ emailFrom: null }) })).toBeNull();
  });

  it("posts the documented request: bearer key, JSON body, and a per-trial Idempotency-Key", async () => {
    const f = okFetch();
    const d = createResendReminderDelivery({ db: dbWith("qa@example.test"), config: config(), fetchImpl: f as unknown as typeof fetch })!;
    await d.deliver(payload);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer re_test_key");
    expect(h["Idempotency-Key"]).toBe(`trial-reminder:${payload.userId}:${payload.trialEndsAt.getTime()}`);
    expect(h["Idempotency-Key"].length).toBeLessThanOrEqual(256);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ from: "Budgts <reminders@example.test>", to: ["qa@example.test"], subject: "Your free trial ends tomorrow", tags: [{ name: "category", value: "trial_reminder" }] });
    expect(body.text).toContain("/manage-subscription");
  });

  it("a different trial period has a different idempotency key (a later trial can be reminded again)", async () => {
    const keys: string[] = [];
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      keys.push((init.headers as Record<string, string>)["Idempotency-Key"]);
      return new Response("{}");
    });
    const d = createResendReminderDelivery({ db: dbWith("qa@example.test"), config: config(), fetchImpl: f as unknown as typeof fetch })!;
    await d.deliver(payload);
    await d.deliver({ ...payload, trialEndsAt: new Date(payload.trialEndsAt.getTime() + 86_400_000) });
    expect(new Set(keys).size).toBe(2);
  });

  it("refuses (without calling the provider) when there is no address or the sandbox does not allow it", async () => {
    const f = okFetch();
    await expect(createResendReminderDelivery({ db: dbWith(null), config: config(), fetchImpl: f as unknown as typeof fetch })!.deliver(payload)).rejects.toThrow(ReminderUndeliverableError);
    await expect(createResendReminderDelivery({ db: dbWith("real.customer@gmail.com"), config: config(), fetchImpl: f as unknown as typeof fetch })!.deliver(payload)).rejects.toThrow(/sandbox/);
    expect(f).not.toHaveBeenCalled();
  });

  it("a provider failure THROWS (so the sweep releases the claim) and never echoes the body", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ message: "qa@example.test is invalid" }), { status: 422 }));
    const d = createResendReminderDelivery({ db: dbWith("qa@example.test"), config: config(), fetchImpl: f as unknown as typeof fetch })!;
    await expect(d.deliver(payload)).rejects.toThrow("Resend rejected the reminder (HTTP 422)");
    await expect(d.deliver(payload)).rejects.not.toThrow(/qa@example\.test/);
  });
});
