import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  hasAdminCredentials,
  magicTokenHash,
} from "./helpers/test-user";
import { completeOnboarding } from "./helpers/onboard";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

// Product state pinned here: Budgts currently has NO app tour (a replacement is being built
// separately). A first-run user goes onboarding -> Home, and nothing may lead into a tour.
// When the replacement tour ships, this spec is the one to delete or rewrite deliberately.

const RETIRED_URLS = ["/tour", "/tour/organize", "/tour/disconnect", "/help/how-it-works"];

test("no tour: a new user goes from onboarding straight to Home, and nothing links to a tour", async ({
  page,
}) => {
  const user = await createTestUser();
  try {
    await page.goto(`/auth/callback?token_hash=${await magicTokenHash(user.email)}&type=magiclink&next=/`);

    // A brand-new profile has never seen any tour; it must not be sent to one.
    await completeOnboarding(page);
    await expect(page.getByText("Money Left", { exact: true }).first()).toBeVisible();

    // Neither Home nor any menu/help/settings page exposes a tour or "How Budgts Works" entry point.
    for (const path of ["/", "/more", "/settings", "/help"]) {
      await page.goto(path);
      await expect(page).toHaveURL((u) => u.pathname === path);
      await expect(page.locator('a[href*="tour"], a[href*="how-it-works"]')).toHaveCount(0);
      await expect(page.getByText(/replay the tour|how budgts works/i)).toHaveCount(0);
    }

    // The retired URLs are plain 404s: no dead or partial tour to wander into, and no redirect loop.
    for (const url of RETIRED_URLS) {
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(404);
    }

    // Still onboarded and unaffected: Home loads normally afterwards.
    await page.goto("/");
    await expect(page.getByText("Money Left", { exact: true }).first()).toBeVisible();
  } finally {
    await deleteTestUser(user.id);
  }
});
