/**
 * Live proof that the native app's Bearer-token transport works against a real
 * server, not just an in-process call: a phone talks to the app over plain
 * HTTPS. Uses Playwright's `request` fixture (no browser) against whatever
 * `baseURL` playwright.config.ts resolves.
 *
 * Covers the proxy allow-list (a cookie-less request must reach the handler's
 * own 401, never the HTML sign-in page), token verification, and first-run
 * onboarding with the device time zone.
 *
 * Design authority: docs/specs/2026-09-17-mobile-app-launch-design.md §4/§6.
 */
import { expect, test } from "@playwright/test";
import { createTestUser, deleteTestUser, hasAdminCredentials, mintAccessToken } from "./helpers/test-user";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY");

test("GET /api/mobile/session accepts a real mobile-style Bearer token", async ({ request }) => {
  const user = await createTestUser();
  try {
    const accessToken = await mintAccessToken(user.email);

    const response = await request.get("/api/mobile/session", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.json()).toEqual({ id: user.id, email: user.email });
  } finally {
    await deleteTestUser(user.id);
  }
});

test("GET /api/mobile/session rejects a garbage Bearer token with JSON, not the sign-in page", async ({ request }) => {
  const response = await request.get("/api/mobile/session", {
    headers: { Authorization: "Bearer not-a-real-token" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

test("GET /api/mobile/session rejects a request with no Authorization header", async ({ request }) => {
  const response = await request.get("/api/mobile/session", { maxRedirects: 0 });
  expect(response.status()).toBe(401);
});

test("a new account onboards over the native API with its device time zone", async ({ request }) => {
  const user = await createTestUser();
  try {
    const headers = { Authorization: `Bearer ${await mintAccessToken(user.email)}` };

    const before = await request.get("/api/mobile/profile", { headers });
    expect(before.status()).toBe(200);
    expect(await before.json()).toMatchObject({ onboarded: false, timeZone: null });

    const onboard = await request.post("/api/mobile/onboarding", {
      headers,
      data: { currency: "CAD", time_zone: "America/Vancouver" },
    });
    expect(onboard.status()).toBe(200);
    expect(await onboard.json()).toEqual({ onboarded: true, currency: "CAD", timeZone: "America/Vancouver" });

    const moved = await request.patch("/api/mobile/profile", { headers, data: { time_zone: "America/Halifax" } });
    expect(moved.status()).toBe(200);

    const after = await request.get("/api/mobile/profile", { headers });
    expect(await after.json()).toMatchObject({ onboarded: true, currency: "CAD", timeZone: "America/Halifax" });
  } finally {
    await deleteTestUser(user.id);
  }
});
