/**
 * Live proof that the mobile Bearer-token transport works against a real
 * deployed server, not just an in-process call — a phone talks to the app
 * over plain HTTPS, it never imports `getRequestUser` directly. Uses
 * Playwright's `request` fixture (no browser needed) against whatever
 * `baseURL` playwright.config.ts resolves — a real deployment when
 * `PLAYWRIGHT_BASE_URL` is set, matching delete-account.spec.ts's own
 * live-staging pattern.
 *
 * Design authority: docs/specs/2026-09-17-mobile-app-launch-design.md §4/§6
 * (Bearer-token Route Handlers, server-verified identity).
 */
import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  hasAdminCredentials,
  mintAccessToken,
} from "./helpers/test-user";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

test("GET /api/mobile/session accepts a real mobile-style Bearer token", async ({ request }) => {
  const user = await createTestUser();
  try {
    const accessToken = await mintAccessToken(user.email);

    const response = await request.get("/api/mobile/session", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ id: user.id, email: user.email });
  } finally {
    await deleteTestUser(user.id);
  }
});

test("GET /api/mobile/session rejects a garbage Bearer token", async ({ request }) => {
  const response = await request.get("/api/mobile/session", {
    headers: { Authorization: "Bearer not-a-real-token" },
  });
  expect(response.status()).toBe(401);
});

test("GET /api/mobile/session rejects a request with no Authorization header", async ({ request }) => {
  const response = await request.get("/api/mobile/session");
  expect(response.status()).toBe(401);
});

test("POST /api/account/delete accepts a Bearer token and deletes the account", async ({ request }) => {
  const user = await createTestUser();
  const accessToken = await mintAccessToken(user.email);
  try {
    // A freshly-minted session satisfies the reauth (step-up) window, same
    // as the cookie-based e2e path in delete-account.spec.ts.
    const response = await request.post("/api/account/delete", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
  } finally {
    // Already gone (Path A) — a harmless no-op, proving idempotency in passing.
    await deleteTestUser(user.id);
  }
});
