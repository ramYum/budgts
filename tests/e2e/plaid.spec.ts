import { expect, test, type Page } from "@playwright/test";
import { createTestUser, deleteTestUser, hasAdminCredentials, magicTokenHash } from "./helpers/test-user";
import { onboardAndSkipTour } from "./helpers/onboard";

/**
 * Full Plaid journey against a deployed, Plaid-enabled environment (design §26,
 * workstream C). Uses `/api/plaid/test/seed` to mint a Sandbox `public_token`
 * and POSTs it straight to the real `/api/plaid/exchange` — Plaid Link's
 * iframe is not reliably scriptable, so this exercises every Budgts step
 * *after* Link for real, exactly as the design doc prescribes.
 *
 * SAFETY: this must never run against a server wired to production Supabase.
 * `createTestUser`/`magicTokenHash` write real rows via the Supabase Admin API
 * for whatever `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SECRET_KEY` are loaded —
 * on `budgts.com` that is production. Skipped unless BOTH admin credentials
 * are present AND `PLAYWRIGHT_BASE_URL` explicitly targets a staging deploy.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "";
const targetsStaging = /staging/i.test(baseURL);

test.skip(
  !hasAdminCredentials() || !targetsStaging,
  "needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY for the STAGING project, and " +
    "PLAYWRIGHT_BASE_URL pointing at the staging deploy (e.g. https://budgts-staging.vercel.app) — " +
    "never run this against a production-wired server.",
);

/** Every unmapped-account row defaults to "A new Budgts account"; set every row
 * except "Plaid Checking" to "Don't import this one". Sandbox lists a new item's
 * accounts in a varying order and only Checking carries the canned transaction
 * history (Cash Management, Saving, etc. have none) — importing "the first row"
 * imports an account with no transactions on some runs. */
async function importOnlyPlaidChecking(page: Page) {
  const rows = page.getByRole("dialog", { name: "Choose which accounts to import" }).getByRole("listitem");
  const count = await rows.count();
  let checking = 0;
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    if ((await row.getByText("Plaid Checking").count()) > 0) {
      checking++;
      continue;
    }
    await row.getByRole("combobox", { name: "Import as" }).selectOption("Don't import this one");
  }
  expect(checking).toBe(1);
}

/**
 * Sandbox generates a new item's canned transaction history asynchronously, and
 * the first `/transactions/sync` (fired by `mapAccounts`) can return nothing or
 * only part of it; a later sync adds the rest. This browser journey can't see
 * Plaid's readiness signal (the access token is server-side), so it waits on
 * the UI's own state instead: the Activity list shows transactions. Only while
 * it is still empty does it press "Sync now" on /connected-banks, and it waits
 * for that sync's own result message ("Synced.", or the "already running" /
 * "just finished" lease notice) before re-checking — no fixed sleeps. Bounded
 * by `toPass`'s timeout. Sandbox-only; real banks have history at connect time.
 */
async function waitForSyncedTransactions(page: Page) {
  await expect(async () => {
    await page.goto("/transactions");
    const empty = page.getByText("No transactions this month yet.");
    const list = page.getByRole("searchbox", { name: "Search transactions" }); // rendered only when there are rows
    await expect(empty.or(list)).toBeVisible(); // wait for the page to settle; isVisible() alone is instantaneous
    if (await list.isVisible()) return;

    await page.goto("/connected-banks");
    await page.getByRole("button", { name: "Sync now" }).click();
    await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible(); // not "Syncing…"
    await expect(page.getByText(/^Synced\.$|already running|just finished/)).toBeVisible();
    throw new Error("still no transactions after that sync; checking again"); // toPass re-checks the list
  }).toPass({ timeout: 150_000, intervals: [0, 2_000, 5_000] });
}

test("connect a bank, map an account, import, categorize, disconnect, history remains", async ({ page }) => {
  test.setTimeout(240_000); // Sandbox history lands asynchronously; see waitForSyncedTransactions
  const user = await createTestUser();
  try {
    const tokenHash = await magicTokenHash(user.email);
    await page.goto(`/auth/callback?token_hash=${tokenHash}&type=magiclink&next=/`);
    await onboardAndSkipTour(page);

    // --- Connect (bypasses the un-scriptable Plaid Link iframe, design §26) ---
    const seed = await (
      await page.request.post("/api/plaid/test/seed", { data: {} })
    ).json();
    const exchange = await (
      await page.request.post("/api/plaid/exchange", {
        data: { public_token: seed.public_token, institution: seed.institution },
      })
    ).json();
    expect(exchange.plaidItemId).toBeTruthy();
    expect(exchange.accounts.length).toBeGreaterThan(0);

    // --- Map: the real <AccountMapping> UI, server-rendered from the DB ---
    await page.goto("/connected-banks");
    // the Sandbox suffix is shown as a badge, not in the name
    await expect(page.getByText("First Platypus Bank", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Choose accounts to import" }).click();
    await importOnlyPlaidChecking(page);
    await page.getByRole("button", { name: "Import transactions" }).click();
    // mapAccounts links the accounts AND runs the first Plaid sync inline before the
    // dialog closes, so wait for that (bounded) rather than the 5s default.
    await expect(page.getByRole("dialog", { name: "Choose which accounts to import" })).toBeHidden({ timeout: 90_000 });
    await expect(page.getByText("not set up")).toHaveCount(0); // list refreshed

    // --- Import: first sync runs as part of mapping; retry for Sandbox lag ---
    await waitForSyncedTransactions(page);
    await expect(page.getByText("No transactions this month yet.")).toHaveCount(0);
    await expect(page.getByRole("searchbox", { name: "Search transactions" })).toBeVisible();

    // --- Categorize an ambiguous ("Needs a category") transaction ---
    // Assert by row *count*, not merchant text: Plaid Sandbox's canned
    // dataset can legitimately contain several transactions with the
    // identical description (e.g. repeated "Uber 063015 SF**POOL**" rides)
    // sharing one merchant_entity_id, so picking a category for one can
    // correctly backfill more than one row at once (design §18) — asserting
    // an exact "count - 1", or "no row with this text remains", would wrongly
    // fail on that correct behavior. Assert only the direction: it shrinks,
    // and a subsequent Re-scan never makes it grow back.
    const needsCategory = page.locator("#needs-category");
    if (await needsCategory.isVisible().catch(() => false)) {
      const rows = needsCategory.locator("li");
      const before = await rows.count();
      await needsCategory.getByRole("combobox").first().selectOption({ label: "Entertainment" });
      await expect(rows).not.toHaveCount(before);
      const afterPick = await rows.count();
      expect(afterPick).toBeLessThan(before);

      // --- Merchant rule behavior: re-scanning after a correction must not
      // regress it back into "Needs a category" (the rule + the row's own
      // category both persist). Rule-creation internals are covered at the DB
      // level by tests/integration/{categorize-backfill,recategorize}.test.ts.
      const rescan = page.getByRole("button", { name: "Re-scan" });
      if (await rescan.isVisible().catch(() => false)) {
        await rescan.click();
        await page.waitForTimeout(1000);
        const afterRescan = await rows.count();
        expect(afterRescan).toBeLessThanOrEqual(afterPick); // never regrows
      }
    }

    // --- Disconnect: history must remain (design §24) ---
    const csvBefore = await (await page.request.get("/api/export/transactions")).text();
    const importedRows = csvBefore.split("\n").length;
    expect(importedRows).toBeGreaterThan(1); // header + at least one imported row

    await page.goto("/connected-banks");
    await page.getByRole("button", { name: "Disconnect" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByText("First Platypus Bank", { exact: true })).toHaveCount(0);

    const csvAfter = await (await page.request.get("/api/export/transactions")).text();
    expect(csvAfter.split("\n").length).toBe(importedRows); // nothing lost
  } finally {
    await deleteTestUser(user.id);
  }
});
