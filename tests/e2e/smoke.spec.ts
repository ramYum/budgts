import { expect, test } from "@playwright/test";

test("unauthenticated visitors are redirected to sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("sign-in page offers magic link and Google", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign-in link/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
});

test("offline fallback page renders without a session", async ({ page }) => {
  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: /offline/i })).toBeVisible();
});

test("serves a web app manifest", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest.name).toBe("Budgt");
});

test("serves the service worker without an auth redirect", async ({ request }) => {
  // The proxy must not 3xx /sw.js — a redirected SW script fails to register.
  const res = await request.get("/sw.js", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/javascript/);
});
