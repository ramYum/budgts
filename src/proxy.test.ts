import { describe, expect, it } from "vitest";
import { isPublic } from "./proxy";

describe("isPublic — native-app compliance and link pages", () => {
  it("serves the store-required legal, support and deletion-request pages without a session", () => {
    for (const p of ["/privacy", "/terms", "/support", "/account-deletion"]) expect(isPublic(p)).toBe(true);
  });

  it("serves the universal-link / app-link association files and the native return path without a session", () => {
    expect(isPublic("/.well-known/apple-app-site-association")).toBe(true);
    expect(isPublic("/.well-known/assetlinks.json")).toBe(true);
    expect(isPublic("/app/plaid-oauth")).toBe(true);
  });

  it("does not loosen anything next to them", () => {
    expect(isPublic("/privacy-settings")).toBe(false);
    expect(isPublic("/supportive")).toBe(false);
    expect(isPublic("/application")).toBe(false);
  });
});

describe("isPublic", () => {
  it("lets Plaid's server-to-server endpoints through without a session", () => {
    // Plaid's webhook (JWT-signed) and the pg_cron pollers (bearer secret)
    // carry no user cookie — the proxy must not redirect them to /sign-in
    // before the route handler's own auth runs (design §20 / workstream B).
    // recurring-scan (V1.5) was caught missing here during staging
    // verification: without this, its own bearer-secret check in the route
    // handler never runs at all -- every call 307s to /sign-in first.
    expect(isPublic("/api/plaid/webhook")).toBe(true);
    expect(isPublic("/api/plaid/sync-due")).toBe(true);
    expect(isPublic("/api/plaid/recurring-scan")).toBe(true);
  });

  it("still requires a session for the user-facing Plaid API routes", () => {
    expect(isPublic("/api/plaid/link-token")).toBe(false);
    expect(isPublic("/api/plaid/exchange")).toBe(false);
    expect(isPublic("/api/plaid/test/seed")).toBe(false);
  });

  it("lets the mobile-ready Route Handlers through for their own Bearer check", () => {
    // These authenticate via getRequestUser() (cookie OR Bearer token,
    // verified server-side) rather than the proxy's cookie-only session
    // check. Caught missing here during live staging verification: a
    // cookie-less mobile request was 307-redirected to /sign-in before
    // getRequestUser() ever ran — same failure mode as recurring-scan above,
    // just for Bearer auth instead of a bearer-secret header. The handlers
    // themselves still return a real 401 for no/invalid auth.
    expect(isPublic("/api/account/delete")).toBe(true);
    expect(isPublic("/api/mobile/session")).toBe(true);
  });

  it("lets the billing endpoints through for their own authentication (user token, provider signature, cron secret)", () => {
    expect(isPublic("/api/billing/entitlement")).toBe(true);
    expect(isPublic("/api/billing/entitlement/refresh")).toBe(true);
    expect(isPublic("/api/billing/webhook/revenuecat")).toBe(true);
    expect(isPublic("/api/billing/reminders/due")).toBe(true);
    expect(isPublic("/api/billing/reconcile/due")).toBe(true);
    expect(isPublic("/api/billing-audit")).toBe(false); // a sibling path is not covered by the prefix
    expect(isPublic("/manage-subscription")).toBe(true); // the reminder email link works signed out
    expect(isPublic("/manage-subscription-admin")).toBe(false);
  });

  it("still requires a session for ordinary app pages", () => {
    expect(isPublic("/")).toBe(false);
    expect(isPublic("/transactions")).toBe(false);
    expect(isPublic("/settings")).toBe(false);
  });

  it("keeps the pre-existing public pages public", () => {
    expect(isPublic("/sign-in")).toBe(true);
    expect(isPublic("/auth/callback")).toBe(true);
    expect(isPublic("/offline")).toBe(true);
  });

  it("does not treat an unrelated path with the same prefix as public", () => {
    // e.g. a route that merely starts with "/api/plaid/webhooks" (plural) is a
    // different path and must not slip through on a loose prefix match.
    expect(isPublic("/api/plaid/webhooks-audit")).toBe(false);
  });
});
