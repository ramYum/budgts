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
    await expect(page).toHaveURL(/\/$/);

    // Set a $400 budget for Food / Groceries.
    await page.getByRole("link", { name: "Budgets" }).click();
    const grocery = page.getByLabel("Food / Groceries budget");
    await grocery.fill("400");
    await grocery.blur();
    await expect(page.getByText(/Budgeted \$400\.00 this month/)).toBeVisible();

    // Spend $340 in that category.
    await addTransaction(page, "340.00", "Food / Groceries");

    // Dashboard: spent tile + a near-budget bar with $60 left, negative net savings.
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page.getByText("$340.00").first()).toBeVisible();
    await expect(page.getByText("Food / Groceries")).toBeVisible();
    await expect(page.getByText("$60.00 left")).toBeVisible();
    await expect(page.getByText("-$340.00")).toBeVisible(); // net savings, no income yet

    // Push it over budget.
    await addTransaction(page, "100.00", "Food / Groceries");
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page.getByText(/Over by \$40\.00/)).toBeVisible();
  } finally {
    await deleteTestUser(user.id);
  }
});
