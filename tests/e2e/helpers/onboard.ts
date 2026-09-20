import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Walks a freshly signed-in user through /onboarding (Skip jumps straight to
 * the required currency step, whatever pitch cards precede it) and stops on the
 * FIRST STEP of the "How Budgts Works" walkthrough, `/tour/organize`.
 *
 * `/tour` itself is only an entry point: it redirects to that first step, so a
 * user never rests on `/tour`. See
 * docs/specs/2026-09-19-how-budgts-works-walkthrough-design.md.
 */
export async function completeOnboarding(page: Page, currency = "USD") {
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("combobox").selectOption(currency);
  await page.getByRole("button", { name: /start budgeting/i }).click();

  await expect(page).toHaveURL(/\/tour\/organize$/, { timeout: 20000 });
}

/**
 * `completeOnboarding`, then the walkthrough's own Skip — which, on a first
 * run, marks the tour seen and lands on Home (`/`). Every spec that only needs
 * "a signed-in user with an onboarded account" uses this.
 */
export async function onboardAndSkipTour(page: Page, currency = "USD") {
  await completeOnboarding(page, currency);

  // Exact match: the first-run header's "Skip" (the walkthrough has no other button of that name).
  await page.getByRole("button", { name: "Skip", exact: true }).click();

  await expect(page).toHaveURL((u) => u.pathname === "/", { timeout: 20000 });
}
