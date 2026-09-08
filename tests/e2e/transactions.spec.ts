import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  hasAdminCredentials,
  magicTokenHash,
} from "./helpers/test-user";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

test("sign in, onboard, add a transaction, edit it, delete it", async ({ page }) => {
  const user = await createTestUser();
  try {
    // Complete sign-in through the real /auth/callback (magic-link token verify).
    const tokenHash = await magicTokenHash(user.email);
    await page.goto(`/auth/callback?token_hash=${tokenHash}&type=magiclink&next=/`);

    // New user -> onboarding.
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByRole("combobox").selectOption("USD");
    await page.getByRole("button", { name: /start budgeting/i }).click();

    // Dashboard shows the seeded categories.
    await page.waitForURL((u) => u.pathname === "/", { timeout: 20000 });
    await expect(page.getByText("so far this month")).toBeVisible();

    // Add a transaction.
    await page.getByRole("link", { name: "Transactions" }).click();
    await page.getByRole("button", { name: "+ Add" }).click();
    await page.getByLabel("Amount").fill("12.34");
    await page.getByLabel("Description").fill("Groceries test");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Groceries test")).toBeVisible();
    await expect(page.getByText("−$12.34")).toBeVisible();

    // Edit it.
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Description").fill("Groceries edited");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Groceries edited")).toBeVisible();

    // Delete it.
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Delete transaction" }).click();
    await expect(page.getByText("No transactions this month yet.")).toBeVisible();
  } finally {
    await deleteTestUser(user.id);
  }
});
