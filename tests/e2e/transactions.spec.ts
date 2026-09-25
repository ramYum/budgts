import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  hasAdminCredentials,
  magicTokenHash,
} from "./helpers/test-user";
import { onboardAndSkipTour } from "./helpers/onboard";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

test("sign in, onboard, add a transaction, edit it, delete it", async ({ page }) => {
  const user = await createTestUser();
  try {
    // Complete sign-in through the real /auth/callback (magic-link token verify).
    const tokenHash = await magicTokenHash(user.email);
    await page.goto(`/auth/callback?token_hash=${tokenHash}&type=magiclink&next=/`);

    // New user -> onboarding -> the first-run tour -> dashboard.
    await onboardAndSkipTour(page);
    await expect(page.getByText("so far this month")).toBeVisible();

    // Add a transaction.
    await page.getByRole("link", { name: "Activity" }).click();
    await page.getByRole("button", { name: "+ Add" }).click();
    await page.getByLabel("Amount").fill("12.34");
    await page.getByLabel("Description").fill("Groceries test");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Groceries test")).toBeVisible();
    await expect(page.getByText("−$12.34")).toBeVisible();

    // CSV export includes the new row.
    const csv = await page.request.get("/api/export/transactions");
    expect(csv.ok()).toBeTruthy();
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const body = await csv.text();
    expect(body).toContain("date,description,note,amount");
    expect(body).toContain("Groceries test");

    // Open the detail popup, then edit from there.
    await page.getByRole("button", { name: "Groceries test" }).click();
    const detail = page.getByRole("dialog", { name: "Transaction" });
    await expect(detail).toBeVisible();
    // The sheet sits on the screen, not inside the page: its backdrop covers
    // the whole viewport. (A leftover entrance-animation transform once
    // trapped it in the page; see tests/unit/motion-guardrails.test.ts.)
    await expect(detail).toBeInViewport();
    const backdrop = await detail.evaluate((d) => {
      const r = d.parentElement!.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const viewport = page.viewportSize()!;
    expect(backdrop).toEqual({ x: 0, y: 0, w: viewport.width, h: viewport.height });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Description").fill("Groceries edited");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Groceries edited")).toBeVisible();

    // Delete it.
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Groceries edited" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Delete transaction" }).click();
    await expect(page.getByText("No transactions this month yet.")).toBeVisible();
  } finally {
    await deleteTestUser(user.id);
  }
});
