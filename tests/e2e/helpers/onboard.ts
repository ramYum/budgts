import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Walks a freshly signed-in user through /onboarding — the currency choice is
 * its one required step — and lands on Home (`/`). Budgts currently ships with
 * NO app tour, so nothing sits between onboarding and Home; if a tour is added
 * later, this helper is where the extra step (and its skip) belongs.
 *
 * Every spec that only needs "a signed-in user with an onboarded account" uses this.
 */
export async function completeOnboarding(page: Page, currency = "USD") {
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("combobox").selectOption(currency);
  await page.getByRole("button", { name: /start budgeting/i }).click();

  await expect(page).toHaveURL((u) => u.pathname === "/", { timeout: 20000 });
}
