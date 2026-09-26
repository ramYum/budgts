import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  hasAdminCredentials,
  magicTokenHash,
} from "./helpers/test-user";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

test("welcome guide: a new user meets Crystal, walks every card, lands on Home, and can replay from Help", async ({
  page,
}) => {
  const user = await createTestUser();
  try {
    const tokenHash = await magicTokenHash(user.email);
    await page.goto(`/auth/callback?token_hash=${tokenHash}&type=magiclink&next=/`);

    // Onboarding: Crystal -> What Budgts does -> (maybe Every purchase,
    // tracked) -> Currency.
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { name: "Hi, I'm Crystal." })).toBeVisible();
    await page.getByRole("button", { name: "Nice to meet you" }).click();
    await expect(page.getByRole("heading", { name: "Budgeting that does itself." })).toBeVisible();
    await page.getByRole("button", { name: "Show me how" }).click();

    // Walk forward with Next until the currency select shows up, whatever
    // pitch cards this deployment includes (Plaid on/off).
    for (let i = 0; i < 5; i++) {
      if (await page.getByRole("combobox").isVisible().catch(() => false)) break;
      await page.getByRole("button", { name: "Next" }).click();
    }
    await expect(page.getByRole("heading", { name: "Pick your currency." })).toBeVisible();
    await page.getByRole("combobox").selectOption("USD");
    await page.getByRole("button", { name: /start budgeting/i }).click();

    // /tour: walk every card with Next/Continue until "See my finances".
    await page.waitForURL((u) => u.pathname === "/tour", { timeout: 20000 });
    for (let i = 0; i < 8; i++) {
      const finish = page.getByRole("button", { name: /see my finances/i });
      if (await finish.isVisible().catch(() => false)) {
        await finish.click();
        break;
      }
      const next = page.getByRole("button", { name: /^(Next|I'll add things by hand →)$/ });
      await next.click();
    }

    await page.waitForURL((u) => u.pathname === "/", { timeout: 20000 });
    await expect(page.getByRole("heading", { name: "Money left" })).toBeVisible();

    // Reload stays on Home — the tour doesn't show again.
    await page.reload();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Money left" })).toBeVisible();

    // Crystal lives on Home: tap her and she answers (a new user has no
    // income yet, so that's her first line).
    await page.getByRole("button", { name: "Say hi to Crystal" }).click();
    await expect(page.locator('[aria-live="polite"]', { hasText: "No income yet" })).toHaveCount(1);

    // Replay from Help.
    await page.getByRole("link", { name: "More" }).click();
    await page.getByRole("link", { name: "Help" }).click();
    await page.getByRole("link", { name: "Replay the welcome guide" }).click();
    await expect(page).toHaveURL(/\/tour$/);
    await expect(page.getByRole("heading", { name: "Hi, I'm Crystal." })).toBeVisible();

    // …and from the Play welcome guide button on More.
    await page.goto("/more");
    await page.getByRole("link", { name: /^Play welcome guide/ }).click();
    await expect(page).toHaveURL(/\/tour$/);
    await expect(page.getByRole("heading", { name: "Hi, I'm Crystal." })).toBeVisible();
  } finally {
    await deleteTestUser(user.id);
  }
});
