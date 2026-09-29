import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { createTestUser, deleteTestUser, hasAdminCredentials, magicTokenHash } from "./helpers/test-user";
import { onboardAndSkipTour } from "./helpers/onboard";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (staging)");

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(page: Page, email: string, next: string) {
  await page.goto(`/auth/callback?token_hash=${await magicTokenHash(email)}&type=magiclink&next=${encodeURIComponent(next)}`);
}

/** The auth user is gone (Path A: no billing history). */
async function expectUserGone(id: string) {
  const { data, error } = await admin().auth.admin.getUserById(id);
  expect(data.user).toBeNull();
  expect(error?.status).toBe(404);
}

async function confirmAndDelete(page: Page) {
  await page.getByRole("button", { name: /Continue/ }).click();
  const button = page.getByRole("button", { name: "Delete my account" });
  await expect(button).toBeDisabled();
  await page.getByLabel(/Type DELETE to confirm/).fill("delete");
  await expect(button).toBeEnabled();
  await button.click();
}

test("Settings → Delete account explains first, and keeping the account changes nothing", async ({ page }) => {
  const user = await createTestUser();
  try {
    await signIn(page, user.email, "/");
    await onboardAndSkipTour(page);

    await page.goto("/settings");
    await page.getByRole("link", { name: /^Delete account/ }).click();
    await expect(page).toHaveURL(/\/settings\/delete-account$/);
    await expect(page.getByText("What's deleted")).toBeVisible();
    await expect(page.getByText("What's kept")).toBeVisible();

    await page.getByRole("link", { name: "Keep my account" }).click();
    await expect(page).toHaveURL(/\/settings$/);

    // Still a real, working session: visiting the screen signs no one out.
    await page.goto("/");
    await expect(page.getByText(/Good (morning|afternoon|evening),/)).toBeVisible();
  } finally {
    await deleteTestUser(user.id);
  }
});

test("confirming deletes the account, signs out and lands on the confirmation, even before onboarding", async ({ page }) => {
  const user = await createTestUser();
  try {
    // Straight from sign-in to the screen, never onboarded: deletion must not require setting up an account first.
    await signIn(page, user.email, "/settings/delete-account");
    await expect(page).toHaveURL(/\/settings\/delete-account$/);
    await expect(page.getByText("Before you go")).toBeVisible();

    await confirmAndDelete(page);

    await page.waitForURL((u) => u.pathname === "/account-deleted", { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Your account is deleted" })).toBeVisible();
    await expectUserGone(user.id);

    // Signed out for real: an app page sends the visitor to sign-in (/ itself is the company homepage signed out).
    await page.goto("/transactions");
    await page.waitForURL((u) => u.pathname === "/sign-in", { timeout: 15_000 });
  } finally {
    await deleteTestUser(user.id); // already gone: a harmless no-op
  }
});

test("a deletion that already started shows on every screen, and the screen finishes it", async ({ page }) => {
  const user = await createTestUser();
  try {
    await signIn(page, user.email, "/");
    await onboardAndSkipTour(page);

    // What a failed attempt after the lock leaves behind (the write guard's row, migration 0021).
    const { error } = await admin().from("account_deletions").insert({ user_id: user.id });
    expect(error).toBeNull();

    await page.goto("/budgets");
    await expect(page.getByText("Your account is being deleted.")).toBeVisible();
    await page.getByRole("link", { name: "Finish deleting" }).click();

    await expect(page.getByText("Deletion already started.")).toBeVisible();
    await confirmAndDelete(page);

    await page.waitForURL((u) => u.pathname === "/account-deleted", { timeout: 60_000 });
    await expectUserGone(user.id);
  } finally {
    await deleteTestUser(user.id);
  }
});

test("signed out, the screen goes through sign-in and returns to it", async ({ page }) => {
  await page.goto("/settings/delete-account");
  await page.waitForURL((u) => u.pathname === "/sign-in");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/settings/delete-account");
});
