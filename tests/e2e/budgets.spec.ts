import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  hasAdminCredentials,
  magicTokenHash,
} from "./helpers/test-user";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

async function addTransaction(page: import("@playwright/test").Page, amount: string, category: string) {
  await page.goto("/transactions");
  await page.getByRole("button", { name: "+ Add" }).click();
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
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByRole("combobox").selectOption("USD");
    await page.getByRole("button", { name: /start budgeting/i }).click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 20000 });

    // Set a $400 budget for Food / Groceries via its category card.
    await page.getByRole("link", { name: "Budgets" }).click();
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
    await page.getByRole("link", { name: "Home" }).click();
    await expect(page.getByText("$340.00").first()).toBeVisible();
    await expect(page.getByText("Food / Groceries")).toBeVisible();
    // "$60.00 left" now also appears as a substring of the dark header's
    // "$60.00 left to spend · …" line; this asserts the budget-vs-actual bar row.
    await expect(page.getByText("$60.00 left", { exact: true })).toBeVisible();
    await expect(page.getByText("-$340.00")).toBeVisible(); // net savings, no income yet

    // Push it over budget.
    await addTransaction(page, "100.00", "Food / Groceries");
    await page.getByRole("link", { name: "Home" }).click();
    await expect(page.getByText(/Over by \$40\.00/)).toBeVisible();
  } finally {
    await deleteTestUser(user.id);
  }
});
