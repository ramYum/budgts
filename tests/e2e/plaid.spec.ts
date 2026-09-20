import { expect, test, type Page } from "@playwright/test";
import { createTestUser, deleteTestUser, hasAdminCredentials, magicTokenHash } from "./helpers/test-user";
import { completeOnboarding } from "./helpers/onboard";

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

/** Every unmapped-account row defaults to "A new Budgts account"; set every
 * row except the first to "Don't import this one" so only the primary
 * checking account (with real Sandbox activity) gets imported. */
async function skipAllButFirstAccount(page: Page) {
  const selects = page.getByRole("combobox", { name: "Import as" });
  const count = await selects.count();
  for (let i = 1; i < count; i++) {
    await selects.nth(i).selectOption("Don't import this one");
  }
}

/**
 * Sandbox generates a new item's canned transaction set asynchronously — the
 * very first `/transactions/sync` call (fired by `mapAccounts` on submit) can
 * race that generation and come back empty. Plaid's Sandbox cursor semantics
 * do not replay that data through the same cursor lineage afterward, so the
 * fix is the same one `tests/plaid-integration/_plaid.ts`'s
 * `createSandboxItemWithTxns` already uses: retry "Sync now" until data shows
 * up, rather than assuming the first sync landed it. Sandbox-only; production
 * banks already have history at connect time, so this race cannot occur there.
 */
async function syncUntilTransactionsAppear(page: Page, attempts = 12) {
  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      // "Sync now" is on the bank's card on /connected-banks, not on /transactions.
      await page.goto("/connected-banks");
      await page.getByRole("button", { name: "Sync now" }).click({ timeout: 15_000 });
      await page.waitForTimeout(3000);
    }
    await page.goto("/transactions");
    const empty = await page
      .getByText("No transactions this month yet.")
      .isVisible()
      .catch(() => false);
    if (!empty) return;
    await page.waitForTimeout(2000);
  }
  throw new Error("Sandbox never produced transactions to sync after repeated retries");
}

/** Minimal RFC 4180 parse of the export: cells containing commas, quotes or newlines are quoted. */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && csv[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell !== "" || row.length) rows.push([...row, cell]);
  return rows;
}

/**
 * The exported transactions as a multiset of their identity: date, description, amount, direction.
 * Category, status and account are left out on purpose: background categorisation may change them
 * between two snapshots without any transaction being lost.
 */
function transactionIdentities(csv: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [date, description, , amount, direction] of parseCsv(csv).slice(1)) {
    const key = JSON.stringify([date, description, amount, direction]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

test("connect a bank, map an account, import, categorize, disconnect, history remains", async ({ page }) => {
  const user = await createTestUser();
  try {
    const tokenHash = await magicTokenHash(user.email);
    await page.goto(`/auth/callback?token_hash=${tokenHash}&type=magiclink&next=/`);
    await completeOnboarding(page);

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
    // Connected banks live on their own page (moved out of Settings by the UI redesign).
    await page.goto("/connected-banks");
    await expect(page.getByText("First Platypus Bank (Sandbox)")).toBeVisible();
    await page.getByRole("button", { name: "Choose accounts to import" }).click();
    await skipAllButFirstAccount(page);
    await page.getByRole("button", { name: "Import transactions" }).click();
    // Submitting runs the mapping AND the first real Plaid sandbox sync, which can take well over the
    // 5s default; the overlay closing is the completion signal. Bounded, and only for this step.
    await expect(page.getByRole("button", { name: "Import transactions" })).toBeHidden({ timeout: 45_000 });
    // Afterwards every account is either mapped ("→ name") or declined ("not imported"): none untouched.
    // The refreshed list lands a while after the overlay closes: measured 4.8s to 8.0s over five runs
    // against a deployed staging site, i.e. routinely past the 5s default. Bounded to 30s.
    await expect(page.getByText("not set up")).toHaveCount(0, { timeout: 30_000 });

    // --- Import: first sync runs as part of mapping; retry for Sandbox lag ---
    await syncUntilTransactionsAppear(page);
    await expect(page.getByText("No transactions this month yet.")).toHaveCount(0);

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
    // Same refresh lag as after Import (measured 4.8-8.0s): the list drops the bank once the action's
    // revalidation lands. Bounded to 30s; the assertion itself is unchanged.
    await expect(page.getByText("First Platypus Bank (Sandbox)")).toHaveCount(0, { timeout: 30_000 });

    const csvAfter = await (await page.request.get("/api/export/transactions")).text();
    // Nothing lost: every transaction exported before Disconnect is still exported after it. Asserted as
    // containment, not equal counts, because Sandbox delivers its canned history in waves and a background
    // sync can legitimately import MORE rows between the two snapshots (observed on staging: 7 -> 19).
    // Disconnect can only remove rows, so any that vanished are reported by identity.
    const after = transactionIdentities(csvAfter);
    const lost = [...transactionIdentities(csvBefore)].filter(([key, n]) => (after.get(key) ?? 0) < n).map(([key]) => key);
    expect(lost, "transactions that disappeared when the bank was disconnected").toEqual([]);
  } finally {
    await deleteTestUser(user.id);
  }
});
