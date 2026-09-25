import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  hasAdminCredentials,
  magicTokenHash,
} from "./helpers/test-user";
import { onboardAndSkipTour } from "./helpers/onboard";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

// next.config.ts keeps visited dynamic pages in the client router cache for
// 30s (experimental.staleTimes.dynamic). A mutation must still show up when
// the user taps back to a tab they saw moments ago — including tabs the server
// action never names in revalidatePath (Budgets). All navigation here is by
// client-side link taps, not page.goto, so the router cache is actually used.
test("a new transaction shows on recently visited tabs within the router-cache window", async ({
  page,
}) => {
  const user = await createTestUser();
  try {
    await page.goto(`/auth/callback?token_hash=${await magicTokenHash(user.email)}&type=magiclink&next=/`);
    await onboardAndSkipTour(page);

    // Visit Budgets so it sits in the client router cache, then come back.
    await page.getByRole("link", { name: "Budgets" }).click();
    await page.waitForURL((u) => u.pathname === "/budgets");
    await expect(page.getByRole("button", { name: /Food \/ Groceries/ })).toBeVisible();
    await expect(page.getByText("$77.77")).toHaveCount(0);

    // Add a transaction from Activity.
    await page.getByRole("link", { name: "Activity" }).click();
    await page.waitForURL((u) => u.pathname === "/transactions");
    await page.getByRole("button", { name: "+ Add" }).click();
    await page.getByLabel("Amount").fill("77.77");
    await page.getByLabel("Category").selectOption({ label: "Food / Groceries" });
    await page.getByLabel("Description").fill("router cache check");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("router cache check")).toBeVisible();

    // Back to Budgets and Home by tapping tabs, well inside the 30s window.
    await page.getByRole("link", { name: "Budgets" }).click();
    await page.waitForURL((u) => u.pathname === "/budgets");
    await expect(page.getByText("$77.77").first()).toBeVisible({ timeout: 5000 });

    await page.getByRole("link", { name: "Home" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    await expect(page.getByText("$77.77").first()).toBeVisible({ timeout: 5000 });
  } finally {
    await deleteTestUser(user.id);
  }
});
