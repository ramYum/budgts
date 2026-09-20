import { expect, test } from "@playwright/test";
import { TOUR_TOPICS } from "../../src/lib/tour/topics";
import {
  createTestUser,
  deleteTestUser,
  hasAdminCredentials,
  magicTokenHash,
} from "./helpers/test-user";
import { completeOnboarding } from "./helpers/onboard";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

// The owner-approved wording of the last step, pinned literally so a copy edit cannot slip through
// unnoticed. (Every other step is asserted from TOUR_TOPICS, the product's single source of truth.)
const APPROVED_CONNECT_BANK_ANSWER =
  "Pick your bank in the secure window and sign in there — your bank login goes to your bank, not to Budgts. Then choose which accounts to track, and your transactions start arriving on their own.";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto(`/auth/callback?token_hash=${await magicTokenHash(email)}&type=magiclink&next=/`);
}

test("first-run tour: a new user walks all six steps, lands on Home, and can replay it from Help", async ({ page }) => {
  const user = await createTestUser();
  try {
    await signIn(page, user.email);

    // Onboarding hands off to the walkthrough: /tour is only an entry point that redirects to step 1.
    await completeOnboarding(page);

    const total = TOUR_TOPICS.length;
    expect(total).toBe(6);
    for (const [i, topic] of TOUR_TOPICS.entries()) {
      await expect(page).toHaveURL(new RegExp(`/tour/${topic.id}$`));
      await expect(page.getByText(`How Budgts Works · Step ${i + 1} of ${total}`)).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: topic.question })).toBeVisible();
      await expect(page.getByText(topic.answer, { exact: true })).toBeVisible();

      // A first run can always leave: Skip is present on every step.
      await expect(page.getByRole("button", { name: "Skip", exact: true })).toBeVisible();

      if (i < total - 1) {
        // Exact: the example Home inside the frame has its own "Next month" link.
        await page.getByRole("link", { name: "Next", exact: true }).click();
      }
    }

    // The last step: the approved copy, the real "connect a bank" call to action, and Finish.
    await expect(page.getByText(APPROVED_CONNECT_BANK_ANSWER, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Next", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /Finish/ }).click();

    await expect(page).toHaveURL(/\/$/, { timeout: 20000 });
    await expect(page.getByText("so far this month")).toBeVisible();

    // Reload stays on Home — a finished tour never shows again.
    await page.reload();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("so far this month")).toBeVisible();

    // Replay from Help: the tour again, now as a revisit — Close (back to Help), no Skip.
    await page.getByRole("link", { name: "More" }).click();
    await page.getByRole("link", { name: "Help" }).click();
    await page.getByRole("link", { name: "Replay the tour" }).click();
    await expect(page).toHaveURL(/\/tour\/organize$/);
    await expect(page.getByRole("heading", { level: 1, name: TOUR_TOPICS[0].question })).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Close" }).click();
    await expect(page).toHaveURL(/\/help$/);
  } finally {
    await deleteTestUser(user.id);
  }
});

test("first-run tour: Skip from the middle completes it and lands on Home, and Back/Next navigate between steps", async ({ page }) => {
  const user = await createTestUser();
  try {
    await signIn(page, user.email);
    await completeOnboarding(page);

    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/\/tour\/money-left$/);
    await page.getByRole("link", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(/\/tour\/organize$/);

    // Assert each step landed before clicking again — two clicks fired back-to-back would both hit
    // the same page.
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/\/tour\/money-left$/);
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/\/tour\/categorization$/);

    await page.getByRole("button", { name: "Skip", exact: true }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 20000 });
    await expect(page.getByText("so far this month")).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/$/); // Skipping counted as seeing it: no redirect back into the tour
  } finally {
    await deleteTestUser(user.id);
  }
});

test("the demo inside a step is an inert example: clicking its controls changes nothing", async ({ page }) => {
  const user = await createTestUser();
  try {
    await signIn(page, user.email);
    await completeOnboarding(page);

    const demoControls = page.locator("figure.tour-demo div[inert] button, figure.tour-demo div[inert] a");
    expect(await demoControls.count()).toBeGreaterThan(0);
    await demoControls.first().click({ force: true, timeout: 2000 }).catch(() => {});

    await expect(page).toHaveURL(/\/tour\/organize$/); // did not navigate away
  } finally {
    await deleteTestUser(user.id);
  }
});
