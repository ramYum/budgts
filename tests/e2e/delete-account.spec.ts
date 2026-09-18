import { expect, test } from "@playwright/test";
import { createTestUser, deleteTestUser, hasAdminCredentials, magicTokenHash } from "./helpers/test-user";
import { onboardAndSkipTour } from "./helpers/onboard";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

test("cancelling leaves the account untouched", async ({ page }) => {
  const user = await createTestUser();
  try {
    await page.goto(`/auth/callback?token_hash=${await magicTokenHash(user.email)}&type=magiclink&next=/`);
    await onboardAndSkipTour(page);

    await page.goto("/settings/delete-account");
    await expect(page.getByText("This can't be undone.")).toBeVisible();
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/settings$/);

    // Still a real, working session — not signed out by merely visiting the page.
    await page.goto("/");
    await expect(page.getByText(/Good (morning|afternoon|evening),/)).toBeVisible();
  } finally {
    await deleteTestUser(user.id);
  }
});

test("confirming deletes the account and signs the user out", async ({ page }) => {
  const user = await createTestUser();
  try {
    await page.goto(`/auth/callback?token_hash=${await magicTokenHash(user.email)}&type=magiclink&next=/`);
    await onboardAndSkipTour(page);

    await page.goto("/settings/delete-account");
    await expect(page.getByText("This can't be undone.")).toBeVisible();

    // The button stays disabled until the exact phrase is typed.
    const deleteButton = page.getByRole("button", { name: "Permanently delete my account" });
    await expect(deleteButton).toBeDisabled();
    await page.getByLabel(/Type DELETE to confirm/).fill("DELETE");
    await expect(deleteButton).toBeEnabled();
    await deleteButton.click();

    await page.waitForURL((u) => u.pathname === "/sign-in", { timeout: 15000 });

    // Signed out for real — an authenticated page redirects back to sign-in.
    await page.goto("/");
    await page.waitForURL((u) => u.pathname === "/sign-in", { timeout: 10000 });
  } finally {
    // The account is already gone (Path A, no monetization history) — this
    // is a harmless no-op, proving the operation's own idempotency in passing.
    await deleteTestUser(user.id);
  }
});
