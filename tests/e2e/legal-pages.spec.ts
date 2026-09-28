import { expect, test } from "@playwright/test";

/**
 * The public legal pages, signed out, in whichever state the deployment's switch is (src/lib/legal/config.ts):
 * `GET /api/legal` says which, and everything else must agree with it. Run against a build with the owner facts unset
 * (the default: every page a 404, no links anywhere) and one with them set (every page readable, linked from sign-in).
 */
const PAGES = [
  ["/privacy", "Privacy policy"],
  ["/terms", "Terms of service"],
  ["/support", "Support"],
  ["/account-deletion", "Delete your account"],
] as const;

test("the pages, the sign-in links and /api/legal agree on whether the legal pages are live", async ({ page, request }) => {
  const res = await request.get("/api/legal");
  expect(res.status()).toBe(200);
  const { live, pages } = (await res.json()) as { live: boolean; pages: string[] };

  for (const [path, title] of PAGES) {
    const response = await page.goto(path);
    // public either way: never bounced to sign-in
    expect(new URL(page.url()).pathname).toBe(path);
    if (live) {
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByText(/owner to confirm|\[|TBD/i)).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Legal" })).toBeVisible();
    } else {
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1, name: title })).toHaveCount(0);
    }
  }

  await page.goto("/sign-in");
  await expect(page.getByRole("link", { name: "Terms" })).toHaveCount(live ? 1 : 0);
  await expect(page.getByRole("link", { name: "Privacy policy" })).toHaveCount(live ? 1 : 0);
  expect(pages).toEqual(live ? PAGES.map(([p]) => p) : []);
});

test("the public deletion page starts the web deletion through sign-in", async ({ page, request }) => {
  const { live } = (await (await request.get("/api/legal")).json()) as { live: boolean };
  test.skip(!live, "the legal pages are switched off in this deployment");

  await page.goto("/account-deletion");
  await page.getByRole("link", { name: "Delete my account" }).click();
  await page.waitForURL((u) => u.pathname === "/sign-in");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/settings/delete-account");
});

test("the deletion confirmation page is public", async ({ page }) => {
  const response = await page.goto("/account-deleted?store=1");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Your account is deleted" })).toBeVisible();
  await expect(page.getByText(/does not automatically cancel/)).toBeVisible();
});
