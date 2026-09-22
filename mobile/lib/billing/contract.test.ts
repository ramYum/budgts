import { describe, expect, it } from "vitest";
import { NotAuthenticatedError } from "../auth/api";
import { ContractError, parseEntitlementResponse, parseEntitlementView, parseRefreshResponse, type EntitlementView } from "./contract";
import { loadEntitlement, refreshEntitlement } from "./load-entitlement";
import { manageSubscriptionUrl } from "./purchases";

export const view = (over: Partial<EntitlementView> = {}): EntitlementView => ({
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
  ...over,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("entitlement contract (mirrors the server view-model and validates it at runtime)", () => {
  it("accepts every field the server sends", () => {
    const v = view({ hasPremium: true, status: "trialing", isTrial: true, willRenew: true, trialEndsAt: "2026-10-15T12:00:00.000Z", accessUntil: "2026-10-15T12:00:00.000Z", productId: "budgts_monthly", store: "apple", canStartTrial: false, renewal: { amount: 999, currency: "USD" } });
    expect(parseEntitlementView(v)).toEqual(v);
    expect(parseEntitlementResponse({ entitlement: v })).toEqual(v);
  });

  it("rejects anything it does not understand instead of guessing whether the user has Premium", () => {
    expect(() => parseEntitlementView(null)).toThrow(ContractError);
    expect(() => parseEntitlementView({ ...view(), status: "gold" })).toThrow(/status/);
    expect(() => parseEntitlementView({ ...view(), hasPremium: "yes" })).toThrow(/hasPremium/);
    expect(() => parseEntitlementView({ ...view(), store: "amazon" })).toThrow(/store/);
    expect(() => parseEntitlementView({ ...view(), renewal: { amount: "9.99", currency: "USD" } })).toThrow(/renewal/);
    expect(() => parseEntitlementResponse({})).toThrow(ContractError);
    expect(() => parseRefreshResponse({ status: "weird", entitlement: view() })).toThrow(/refresh status/);
  });

  it("parses a refresh response", () => {
    expect(parseRefreshResponse({ status: "refreshed", entitlement: view({ hasPremium: true, status: "active" }) })).toMatchObject({ status: "refreshed", entitlement: { hasPremium: true } });
  });
});

describe("loading states never leak raw errors and never invent access", () => {
  it("ready on a valid body", async () => {
    expect(await loadEntitlement(async () => json({ entitlement: view({ hasPremium: true, status: "active" }) }))).toMatchObject({ status: "ready", entitlement: { hasPremium: true } });
  });
  it("maps 401 and NotAuthenticatedError to auth, 5xx to unavailable, a thrown error to network, a bad body to contract", async () => {
    expect(await loadEntitlement(async () => json({}, 401))).toMatchObject({ status: "error", kind: "auth" });
    expect(await loadEntitlement(async () => { throw new NotAuthenticatedError(); })).toMatchObject({ status: "error", kind: "auth" });
    expect(await loadEntitlement(async () => json({}, 503))).toMatchObject({ status: "error", kind: "unavailable" });
    expect(await loadEntitlement(async () => { throw new Error("getaddrinfo ENOTFOUND api.internal.example"); })).toMatchObject({ status: "error", kind: "network" });
    expect(await loadEntitlement(async () => json({ entitlement: { hasPremium: true } }))).toMatchObject({ status: "error", kind: "contract" });
    const leaked = JSON.stringify(await loadEntitlement(async () => { throw new Error("getaddrinfo ENOTFOUND api.internal.example"); }));
    expect(leaked).not.toContain("internal.example");
  });
  it("refresh returns the server's verdict with its status", async () => {
    expect(await refreshEntitlement(async () => json({ status: "throttled", entitlement: view() }))).toMatchObject({ status: "ok", refresh: "throttled", entitlement: { hasPremium: false } });
    expect(await refreshEntitlement(async () => json({}, 500))).toMatchObject({ status: "error", kind: "unavailable" });
  });
});

describe("manage subscription", () => {
  it("points at the store's own page (Budgts cannot cancel a store subscription)", () => {
    expect(manageSubscriptionUrl("apple")).toBe("https://apps.apple.com/account/subscriptions");
    expect(manageSubscriptionUrl("google")).toBe("https://play.google.com/store/account/subscriptions?package=com.budgts.app");
    expect(manageSubscriptionUrl(null)).toContain("apps.apple.com");
  });
});
