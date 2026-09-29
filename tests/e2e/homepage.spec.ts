import { expect, test, type Page } from "@playwright/test";
import { createTestUser, deleteTestUser, hasAdminCredentials, magicTokenHash } from "./helpers/test-user";
import { onboardAndSkipTour } from "./helpers/onboard";

/**
 * The company homepage (spec §13a, Phase 1b): budgts.com itself, signed out. src/proxy.ts rewrites a signed-out /
 * to it, so the address stays / and answers 200; a signed-in user still gets the dashboard there.
 */
const WIDTHS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

test("crawlers get the homepage at /, not a redirect to sign-in", async ({ request }) => {
  const res = await request.get("/", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain("Budgeting that does itself.");
  expect(html).toContain("<title>Budgts: budgeting that does itself</title>");
  // the site root itself (NEXT_PUBLIC_SITE_URL), never /company
  expect(html).toMatch(/<link rel="canonical" href="https?:\/\/[^/"]+\/?"/);
  expect(html).toMatch(/<meta property="og:image" content="[^"]+opengraph-image/);
  // no analytics or third-party scripts: every script is this site's own
  const origin = new URL(res.url()).origin;
  for (const [, src] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) expect(new URL(src!, origin).origin).toBe(origin);
});

test("the share image renders", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const image = /<meta property="og:image" content="([^"]+)"/.exec(html)![1]!;
  const res = await request.get(new URL(image).pathname + new URL(image).search);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
});

for (const viewport of WIDTHS) {
  test(`signed out, / is the homepage at ${viewport.width}px, without errors or sideways scroll`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize(viewport);
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.getByRole("heading", { level: 1, name: "Budgeting that does itself." })).toBeVisible();
    await expect(page.getByText("Coming soon to iPhone and Android")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBe(0);
    expect(errors).toEqual([]);
  });
}

test("Sign in leads to the sign-in page, and its Home link leads back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname === "/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.getByRole("link", { name: "Home" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByRole("heading", { level: 1, name: "Budgeting that does itself." })).toBeVisible();
});

test("the footer's legal links open their pages", async ({ page, request }) => {
  const { live } = (await (await request.get("/api/legal")).json()) as { live: boolean };
  await page.goto("/");
  const legal = page.getByRole("contentinfo").getByRole("navigation", { name: "Legal" });
  if (!live) {
    // the pages are 404s in this deployment, so nothing links to them
    await expect(legal).toHaveCount(0);
    return;
  }
  await expect(page.getByRole("contentinfo").getByText(/^© \d{4} .+/)).toBeVisible();
  for (const [name, path, title] of [
    ["Privacy", "/privacy", "Privacy policy"],
    ["Terms", "/terms", "Terms of service"],
    ["Support", "/support", "Support"],
    ["Delete your account", "/account-deletion", "Delete your account"],
  ] as const) {
    await page.goto("/");
    await legal.getByRole("link", { name, exact: true }).click();
    await page.waitForURL((u) => u.pathname === path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  }
});

test.describe("signed in", () => {
  test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

  test("/ is still the dashboard, and /sign-in still sends the user home", async ({ page }) => {
    const user = await createTestUser();
    try {
      await page.goto(`/auth/callback?token_hash=${await magicTokenHash(user.email)}&type=magiclink&next=/`);
      await onboardAndSkipTour(page);
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Money left" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Budgeting that does itself." })).toHaveCount(0);

      await page.goto("/sign-in");
      await page.waitForURL((u) => u.pathname === "/");
      await expect(page.getByRole("heading", { name: "Money left" })).toBeVisible();
    } finally {
      await deleteTestUser(user.id);
    }
  });
});

test("robots.txt and the sitemap are served signed out, not sent to sign-in", async ({ request }) => {
  const robots = await request.get("/robots.txt", { maxRedirects: 0 });
  expect(robots.status()).toBe(200);
  const text = await robots.text();
  expect(text).toMatch(/User-Agent: \*/i);
  expect(text).toMatch(/Allow: \//);
  expect(text).not.toMatch(/Disallow: \/company/);
  expect(text).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);

  const sitemap = await request.get("/sitemap.xml", { maxRedirects: 0 });
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toMatch(/<loc>https?:\/\/[^<]+\/<\/loc>/);
  expect(xml).not.toContain("/company");
});
