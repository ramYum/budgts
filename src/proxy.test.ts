import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOMEPAGE_PATH, isPublic, proxy } from "./proxy";

// The session check itself (a local JWT verification) is src/lib/supabase/proxy.ts; here only its answer matters.
const session = vi.hoisted(() => ({ user: null as { id: string } | null, refreshed: false }));
vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: async () => {
    const response = NextResponse.next();
    if (session.refreshed) response.cookies.set("sb-auth", "refreshed");
    return { response, user: session.user };
  },
}));

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

  it("serves the legal pages, their switch and the deletion confirmation signed out", () => {
    for (const path of ["/privacy", "/terms", "/support", "/account-deletion", "/api/legal", "/account-deleted"]) {
      expect(isPublic(path)).toBe(true);
    }
    // the deletion screen itself needs a session: signed out, the proxy sends it through sign-in
    expect(isPublic("/settings/delete-account")).toBe(false);
    expect(isPublic("/privacy-settings")).toBe(false);
    expect(isPublic("/account-deletion-admin")).toBe(false);
  });

  it("does not treat an unrelated path with the same prefix as public", () => {
    // e.g. a route that merely starts with "/api/plaid/webhooks" (plural) is a
    // different path and must not slip through on a loose prefix match.
    expect(isPublic("/api/plaid/webhooks-audit")).toBe(false);
  });
});

describe("proxy", () => {
  beforeEach(() => {
    session.user = null;
    session.refreshed = false;
  });
  const visit = (path: string) => proxy(new NextRequest(new URL(path, "https://budgts.com")));

  it("shows a signed-out visitor of / the company homepage at the same address, not a redirect", async () => {
    const res = await visit("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(new URL(res.headers.get("x-middleware-rewrite")!).pathname).toBe(HOMEPAGE_PATH);
  });

  it("keeps a refreshed session cookie on the homepage rewrite", async () => {
    session.refreshed = true;
    const res = await visit("/");
    expect(res.headers.get("x-middleware-rewrite")).not.toBeNull();
    expect(res.cookies.get("sb-auth")?.value).toBe("refreshed");
  });

  it("gives a signed-in user the dashboard at /, unchanged", async () => {
    session.user = { id: "u1" };
    const res = await visit("/");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("location")).toBeNull();
  });

  it("still sends a signed-out visitor of an app page to sign in, and back after", async () => {
    const res = await visit("/transactions");
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/sign-in");
    expect(to.searchParams.get("next")).toBe("/transactions");
  });

  it("still sends a signed-in visitor of /sign-in home", async () => {
    session.user = { id: "u1" };
    const res = await visit("/sign-in");
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
  });

  it("serves the homepage's own address, sign-in, robots.txt and the sitemap signed out", async () => {
    expect(isPublic(HOMEPAGE_PATH)).toBe(true);
    expect(isPublic("/sitemap.xml.bak")).toBe(false);
    for (const path of [HOMEPAGE_PATH, "/sign-in", "/robots.txt", "/sitemap.xml"]) {
      const res = await visit(path);
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    }
  });
});
