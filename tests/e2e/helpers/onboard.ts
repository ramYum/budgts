import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Walks a freshly signed-in user through /onboarding (Skip jumps straight to
 * the required currency step, whatever pitch cards precede it) and then
 * /tour (Skip ends the tour from any non-final step). Leaves the page on
 * `/`. See docs/specs/2026-09-15-first-run-tour-design.md.
 */
export async function onboardAndSkipTour(page: Page, currency = "USD") {
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("combobox").selectOption(currency);
  await page.getByRole("button", { name: /start budgeting/i }).click();

  await page.waitForURL((u) => u.pathname === "/tour", { timeout: 20000 });
  const tourSkip = page.getByRole("button", { name: "Skip" });
  if (await tourSkip.isVisible().catch(() => false)) {
    await tourSkip.click();
  } else {
    await page.getByRole("button", { name: /see my finances/i }).click();
  }

  await page.waitForURL((u) => u.pathname === "/", { timeout: 20000 });
}
