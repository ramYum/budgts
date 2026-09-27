import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  hasAdminCredentials,
  magicTokenHash,
} from "./helpers/test-user";
import { onboardAndSkipTour } from "./helpers/onboard";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

// "Today" and "this month" follow the device's time zone: onboarding stores
// it, and <TimeZoneSync> moves it when the device's zone changes.
test("the time zone comes from the device and follows the user when they travel", async ({ browser, baseURL }) => {
  const user = await createTestUser();
  try {
    const tokyo = await browser.newContext({ baseURL, timezoneId: "Asia/Tokyo" });
    const page = await tokyo.newPage();
    await page.goto(`/auth/callback?token_hash=${await magicTokenHash(user.email)}&type=magiclink&next=/`);
    await onboardAndSkipTour(page);

    await page.goto("/settings/profile");
    await expect(page.getByText("Tokyo · Japan Standard Time")).toBeVisible();
    const session = await tokyo.storageState();
    await tokyo.close();

    // The same user opens the app after landing in Los Angeles.
    const losAngeles = await browser.newContext({ baseURL, timezoneId: "America/Los_Angeles", storageState: session });
    const there = await losAngeles.newPage();
    await there.goto("/settings/profile");
    await expect(there.getByText(/^Los Angeles · Pacific (Daylight|Standard) Time$/)).toBeVisible();

    // Stored, not just shown: a fresh load renders it from the server.
    await there.reload();
    await expect(there.getByText(/^Los Angeles · Pacific (Daylight|Standard) Time$/)).toBeVisible();
    await losAngeles.close();
  } finally {
    await deleteTestUser(user.id);
  }
});
