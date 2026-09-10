import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  hasAdminCredentials,
  magicTokenHash,
} from "./helpers/test-user";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

test("create a savings goal, add + withdraw contributions, edit, archive", async ({ page }) => {
  const user = await createTestUser();
  try {
    await page.goto(`/auth/callback?token_hash=${await magicTokenHash(user.email)}&type=magiclink&next=/`);
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByRole("combobox").selectOption("USD");
    await page.getByRole("button", { name: /start budgeting/i }).click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 20000 });

    await page.getByRole("link", { name: "Goals" }).click();
    await expect(page.getByRole("heading", { name: "Savings goals" })).toBeVisible();

    // Create a goal.
    await page.getByRole("button", { name: "+ Add goal" }).click();
    await page.getByLabel("Name").fill("Emergency Fund");
    await page.getByLabel("Target amount").fill("10000");
    await page.getByRole("button", { name: "Create goal" }).click();
    await expect(page.getByText("Emergency Fund")).toBeVisible();
    await expect(page.getByText("$0.00 / $10,000.00")).toBeVisible();

    // Add $2,000.
    await page.getByRole("button", { name: "+ Add", exact: true }).click();
    const addDialog = page.getByRole("dialog");
    await addDialog.getByLabel("Amount").fill("2000");
    await addDialog.getByRole("button", { name: "Add contribution" }).click();
    await expect(page.getByText("$2,000.00 / $10,000.00")).toBeVisible();
    await expect(page.getByText("$8,000.00 to go")).toBeVisible();
    await expect(page.getByText("20%")).toBeVisible();

    // Withdraw $500.
    await page.getByRole("button", { name: "Withdraw" }).click();
    const wDialog = page.getByRole("dialog");
    await wDialog.getByLabel("Amount").fill("500");
    await wDialog.getByRole("button", { name: "Withdraw" }).click();
    await expect(page.getByText("$1,500.00 / $10,000.00")).toBeVisible();
    await expect(page.getByText("15%")).toBeVisible();

    // Rename.
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Name").fill("Rainy Day");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Rainy Day")).toBeVisible();

    // Archive -> leaves the list.
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("Rainy Day")).toHaveCount(0);
    await expect(page.getByText(/No goals yet/)).toBeVisible();
  } finally {
    await deleteTestUser(user.id);
  }
});
