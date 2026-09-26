import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  hasAdminCredentials,
  magicTokenHash,
} from "./helpers/test-user";
import { onboardAndSkipTour } from "./helpers/onboard";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

async function addTransaction(page: import("@playwright/test").Page, amount: string, category: string) {
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByLabel("Amount").fill(amount);
  await page.getByLabel("Category").selectOption({ label: category });
  await page.getByLabel("Description").fill(`spend ${amount}`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`spend ${amount}`)).toBeVisible();
}

test("set a budget, then the dashboard shows budget-vs-actual and savings", async ({ page }) => {
  const user = await createTestUser();
  try {
    await page.goto(`/auth/callback?token_hash=${await magicTokenHash(user.email)}&type=magiclink&next=/`);
    await onboardAndSkipTour(page);

    // Set a $400 budget for Food / Groceries via its category card.
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Budgets" }).click();
    await page.getByRole("button", { name: /Food \/ Groceries/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Change budget" }).click();
    await dialog.getByLabel("Monthly budget").fill("400");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("of $400.00 budget")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();

    // Spend $340 in that category.
    await addTransaction(page, "340.00", "Food / Groceries");

    // Dashboard: spent tile + a near-budget bar with $60 left, negative net savings.
    // Wait for Home itself: without the URL check these assertions could pass
    // against the still-visible Activity page mid-navigation.
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    await expect(page.getByText("$340.00").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Food \/ Groceries/ }).first()).toBeVisible();
    // "$60.00 left" also opens the "Where it went" summary ("$60.00 left of your
    // $400.00 budget"); this asserts the category row itself.
    await expect(
      page.getByRole("listitem").filter({ hasText: "Food / Groceries" }).getByText("$60.00 left", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("-$340.00")).toBeVisible(); // net savings, no income yet

    // Push it over budget.
    await addTransaction(page, "100.00", "Food / Groceries");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    await expect(page.getByText(/Over by \$40\.00/)).toBeVisible();
  } finally {
    await deleteTestUser(user.id);
  }
});
