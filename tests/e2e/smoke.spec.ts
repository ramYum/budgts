import { expect, test } from "@playwright/test";

test("home page renders the app name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Budget Tracker" })).toBeVisible();
});

test("serves a web app manifest", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest.name).toBe("Budget Tracker");
});
