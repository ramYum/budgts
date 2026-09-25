import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  hasAdminCredentials,
  magicTokenHash,
} from "./helpers/test-user";
import { onboardAndSkipTour } from "./helpers/onboard";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

test("manage categories: default set, rename, add, archive, and drill-in", async ({ page }) => {
  const user = await createTestUser();
  try {
    await page.goto(`/auth/callback?token_hash=${await magicTokenHash(user.email)}&type=magiclink&next=/`);
    await onboardAndSkipTour(page);

    await page.getByRole("link", { name: "More" }).click();
    await page.getByRole("link", { name: "Settings" }).click();
    // exact: with Plaid on, the header bell ("Categories up to date") is also a link.
    await page.getByRole("link", { name: "Categories", exact: true }).click();

    // The six seeded expense categories.
    for (const name of [
      "Insurances",
      "Personal Care",
      "Housing",
      "Entertainment",
      "Transportation",
      "Food / Groceries",
    ]) {
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    }

    // Rename Entertainment.
    await page.locator("li", { hasText: "Entertainment" }).getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Name").fill("Fun money");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("link", { name: "Fun money", exact: true })).toBeVisible();

    // Add a category.
    await page.locator("section", { hasText: "Categories" }).getByRole("button", { name: "+ Add" }).click();
    await page.getByLabel("Name").fill("Gifts");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("link", { name: "Gifts", exact: true })).toBeVisible();

    // Archive Insurances -> it leaves the transaction form's category list.
    const insurancesRow = page.locator("li", { hasText: "Insurances" });
    await insurancesRow.getByRole("button", { name: "Archive" }).click();
    await expect(insurancesRow.getByRole("button", { name: "Restore" })).toBeVisible();
    await page.goto("/transactions");
    await page.getByRole("button", { name: "+ Add" }).click();
    await expect(page.getByLabel("Category").locator("option", { hasText: "Insurances" })).toHaveCount(0);
    await expect(page.getByLabel("Category").locator("option", { hasText: "Gifts" })).toHaveCount(1);
    await page.getByRole("button", { name: "Cancel" }).click();

    // Drill into a category from Settings.
    await page.goto("/settings/categories");
    await page.getByRole("link", { name: "Housing", exact: true }).click();
    await expect(page).toHaveURL(/category=/);
    await expect(page.getByText("Showing")).toBeVisible();
    await expect(page.getByText("Housing", { exact: true })).toBeVisible();
  } finally {
    await deleteTestUser(user.id);
  }
});
