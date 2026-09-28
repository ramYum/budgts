import { describe, expect, it } from "vitest";
import { isPublic } from "./proxy";

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

  it("lets the dual-auth Plaid routes and the sandbox-only seed reach their own 401", () => {
    // link-token / exchange / item authenticate a cookie OR a Bearer token themselves (getRequestContext).
    expect(isPublic("/api/plaid/link-token")).toBe(true);
    expect(isPublic("/api/plaid/exchange")).toBe(true);
    expect(isPublic("/api/plaid/item")).toBe(true);
    expect(isPublic("/api/plaid/test/seed")).toBe(true);
  });

  it("lets the native app's Bearer-authenticated API through to its own 401", () => {
    expect(isPublic("/api/mobile/session")).toBe(true);
    expect(isPublic("/api/mobile/profile")).toBe(true);
    expect(isPublic("/api/billing/entitlement")).toBe(true);
    expect(isPublic("/api/account/delete")).toBe(true);
    expect(isPublic("/api/account")).toBe(false);
    expect(isPublic("/api/billing/webhook/revenuecat")).toBe(true);
    // a lookalike path is not the native API
    expect(isPublic("/api/mobileish")).toBe(false);
  });

  it("serves the native link association files and the native OAuth fallback signed out", () => {
    expect(isPublic("/.well-known/apple-app-site-association")).toBe(true);
    expect(isPublic("/.well-known/assetlinks.json")).toBe(true);
    expect(isPublic("/app/plaid-oauth")).toBe(true);
    expect(isPublic("/app/anything-else")).toBe(false);
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
