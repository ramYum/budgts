import { devices, expect, test } from "@playwright/test";

/**
 * The page an app sign-in email link opens in a browser (src/app/app/auth/callback): public, signed out; on a
 * computer it says to open the link on the phone and keeps web sign-in one tap away (account deletion needs it);
 * on a phone it hands the whole link to the app. It never shows or sends the code anywhere else.
 */

test("on a computer: open it on your phone, or sign in on the web", async ({ page }) => {
  const response = await page.goto("/app/auth/callback?code=not-a-real-code");
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/app/auth/callback"); // public: never bounced to sign-in
  await expect(page.getByRole("heading", { level: 1, name: "Open this link on your phone" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the Budgts app" })).toHaveCount(0);
  await page.getByRole("link", { name: "Sign in on the web" }).click();
  await page.waitForURL((u) => u.pathname === "/sign-in");
});

test("on a computer, an expired link says so", async ({ page }) => {
  await page.goto("/app/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  await expect(page.getByText(/it has expired/)).toBeVisible();
});

test.describe("on a phone", () => {
  const { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ userAgent, viewport, deviceScaleFactor, isMobile, hasTouch });

  test("hands the whole link to the app", async ({ page }) => {
    await page.goto("/app/auth/callback?code=abc-123");
    await expect(page.getByRole("heading", { level: 1, name: "Finish in the app" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open the Budgts app" })).toHaveAttribute("href", "budgts://auth/callback?code=abc-123");
    await expect(page.getByRole("link", { name: "Sign in on the web" })).toBeVisible();
  });

  test("carries a failed link's error over, and explains it", async ({ page }) => {
    await page.goto("/app/auth/callback#error=access_denied&error_code=otp_expired");
    await expect(page.getByRole("heading", { level: 1, name: "This link has expired" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open the Budgts app" })).toHaveAttribute(
      "href",
      "budgts://auth/callback?error=access_denied&error_code=otp_expired",
    );
  });
});
