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

  it("still requires a session for the user-facing Plaid API routes", () => {
    expect(isPublic("/api/plaid/link-token")).toBe(false);
    expect(isPublic("/api/plaid/exchange")).toBe(false);
    expect(isPublic("/api/plaid/test/seed")).toBe(false);
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
