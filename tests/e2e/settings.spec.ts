import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  hasAdminCredentials,
  magicTokenHash,
} from "./helpers/test-user";
import { onboardAndSkipTour } from "./helpers/onboard";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

// A category row's link reads its name, then what's in it ("Housing Nothing this month").
const categoryLink = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("link", { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")} `) });

test("manage categories: default set, rename, add, archive, and drill-in", async ({ page }) => {
  const user = await createTestUser();
  try {
    await page.goto(`/auth/callback?token_hash=${await magicTokenHash(user.email)}&type=magiclink&next=/`);
    await onboardAndSkipTour(page);

    await page.getByRole("link", { name: "More" }).click();
    // The More page's row, not the desktop sidebar's own Settings link.
    await page.getByRole("main").getByRole("link", { name: "Settings" }).click();
    // The row reads "Categories 8"; with Plaid on, the bell ("Categories up to date") is also a link.
    await page.getByRole("link", { name: /^Categories \d+$/ }).click();

    // The six seeded expense categories.
    for (const name of [
      "Insurances",
      "Personal Care",
      "Housing",
      "Entertainment",
      "Transportation",
      "Food / Groceries",
    ]) {
      await expect(categoryLink(page, name)).toBeVisible();
    }

    // Rename Entertainment.
    await page.locator("li", { hasText: "Entertainment" }).getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Name").fill("Fun money");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(categoryLink(page, "Fun money")).toBeVisible();

    // Add a category.
    await page.getByRole("button", { name: "Add category" }).click();
    await page.getByLabel("Name").fill("Gifts");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(categoryLink(page, "Gifts")).toBeVisible();

    // Archive Insurances -> it leaves the transaction form's category list.
    const insurancesRow = page.locator("li", { hasText: "Insurances" });
    await insurancesRow.getByRole("button", { name: "Archive" }).click();
    await expect(insurancesRow.getByRole("button", { name: "Restore" })).toBeVisible();
    await page.goto("/transactions");
    await page.getByRole("button", { name: "Add transaction" }).click();
    await expect(page.getByLabel("Category").locator("option", { hasText: "Insurances" })).toHaveCount(0);
    await expect(page.getByLabel("Category").locator("option", { hasText: "Gifts" })).toHaveCount(1);
    await page.getByRole("button", { name: "Cancel" }).click();

    // Drill into a category from Settings.
    await page.goto("/settings/categories");
    await categoryLink(page, "Housing").click();
    await expect(page).toHaveURL(/category=/);
    await expect(page.getByText("Showing")).toBeVisible();
    await expect(page.getByText("Housing", { exact: true })).toBeVisible();
  } finally {
    await deleteTestUser(user.id);
  }
});
