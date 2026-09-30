import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { createTestUser, deleteTestUser, hasAdminCredentials, magicTokenHash, mintAccessToken } from "./helpers/test-user";
import { onboardAndSkipTour } from "./helpers/onboard";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Regression: editing a transaction whose account can no longer take new
 * entries (here, a bank account whose connection was removed while its history
 * was kept) must not move the transaction to another account. Before the fix
 * the edit form's account list left that account out, so the browser picked
 * the first account in the list and "Save changes" silently moved the row.
 *
 * The seeded state is exactly what a disconnect leaves behind: an
 * `accounts` row with `source = 'plaid'` and no live `plaid_accounts` link
 * (disconnect deletes the link rows and keeps the account), plus a manual
 * entry the user had added on that account while the bank was connected.
 */
test("editing a transaction on a disconnected bank's account keeps its account", async ({ page }) => {
  const user = await createTestUser();
  const db = admin();
  try {
    await page.goto(`/auth/callback?token_hash=${await magicTokenHash(user.email)}&type=magiclink&next=/`);
    await onboardAndSkipTour(page);

    const { data: oldBank, error: accErr } = await db
      .from("accounts")
      .insert({ user_id: user.id, name: "Zeta Bank Checking", type: "checking", source: "plaid" })
      .select("id")
      .single();
    if (accErr) throw accErr;
    const { data: category } = await db
      .from("categories")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("kind", "expense")
      .order("name")
      .limit(1)
      .single();
    const { data: txn, error: txnErr } = await db
      .from("transactions")
      .insert({
        user_id: user.id,
        account_id: oldBank!.id,
        amount: 4321,
        direction: "debit",
        occurred_at: new Date().toISOString(),
        description: "Kept history coffee",
        source: "manual",
        status: "confirmed",
      })
      .select("id")
      .single();
    if (txnErr) throw txnErr;

    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Activity" }).click();
    await page.getByRole("button", { name: "Kept history coffee" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    // The row's own account is offered (and selected), even though it can't take new entries.
    await expect(page.getByRole("combobox", { name: "Account" })).toHaveValue(oldBank!.id);
    await page.getByRole("combobox", { name: "Category" }).selectOption(category!.id);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog", { name: "Edit transaction" })).toBeHidden();

    const { data: after } = await db
      .from("transactions")
      .select("account_id, category_id")
      .eq("id", txn!.id)
      .single();
    expect(after).toEqual({ account_id: oldBank!.id, category_id: category!.id });
  } finally {
    await deleteTestUser(user.id);
  }
});

/**
 * Owner decision 2026-09-30: a bank-imported row stays on the account it was imported to. The web edit form shows the
 * account read-only, and the server (shared by the web action and the native PATCH) refuses a move with a field error.
 * Seeded as a live bank link (synthetic: the Item's token is not a real one and is never used here).
 */
test("a bank-imported transaction keeps its account: read-only on the web, refused by the API", async ({ page, request }) => {
  const user = await createTestUser();
  const db = admin();
  try {
    await page.goto(`/auth/callback?token_hash=${await magicTokenHash(user.email)}&type=magiclink&next=/`);
    await onboardAndSkipTour(page);

    const { data: main } = await db.from("accounts").select("id").eq("user_id", user.id).eq("name", "Main").single();
    const { data: bankAccount, error: accErr } = await db
      .from("accounts")
      .insert({ user_id: user.id, name: "Zeta Bank Checking", type: "checking", source: "plaid" })
      .select("id")
      .single();
    if (accErr) throw accErr;
    const now = new Date().toISOString();
    const { data: item, error: itemErr } = await db
      .from("plaid_items")
      .insert({
        user_id: user.id,
        item_id: `e2e-item-${user.id}`,
        institution_name: "E2E Bank",
        access_token_enc: "e2e-synthetic-not-a-token",
        last_synced_at: now,
        last_refresh_requested_at: now,
      })
      .select("id")
      .single();
    if (itemErr) throw itemErr;
    const { data: link, error: linkErr } = await db
      .from("plaid_accounts")
      .insert({
        user_id: user.id,
        plaid_item_id: item!.id,
        plaid_account_id: `e2e-pa-${user.id}`,
        account_id: bankAccount!.id,
        link_state: "mapped",
        name: "Checking",
      })
      .select("id")
      .single();
    if (linkErr) throw linkErr;
    const { data: category } = await db
      .from("categories")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "expense")
      .order("name")
      .limit(1)
      .single();
    const { data: txn, error: txnErr } = await db
      .from("transactions")
      .insert({
        user_id: user.id,
        account_id: bankAccount!.id,
        plaid_account_id: link!.id,
        category_id: category!.id,
        amount: 1250,
        direction: "debit",
        occurred_at: now,
        description: "Imported bank coffee",
        source: "bank",
        source_ref: `e2e-txn-${user.id}`,
        status: "confirmed",
      })
      .select("id")
      .single();
    if (txnErr) throw txnErr;

    // Web: the account is shown, not offered as a choice; saving an edit keeps it.
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Activity" }).click();
    await page.getByRole("button", { name: "Imported bank coffee" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Edit transaction" });
    await expect(editor.getByRole("combobox", { name: "Account" })).toHaveCount(0);
    await expect(editor.getByText("Zeta Bank Checking")).toBeVisible();
    await editor.getByLabel("Description").fill("Imported bank coffee, noted");
    await editor.getByRole("button", { name: "Save changes" }).click();
    await expect(editor).toBeHidden();
    const { data: afterWeb } = await db.from("transactions").select("account_id, description").eq("id", txn!.id).single();
    expect(afterWeb).toEqual({ account_id: bankAccount!.id, description: "Imported bank coffee, noted" });

    // API (the native PATCH, same server rule): a move to an open account is refused with a field error.
    const token = await mintAccessToken(user.email);
    const res = await request.patch(`/api/mobile/transactions/${txn!.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        accountId: main!.id,
        categoryId: category!.id,
        amount: "12.50",
        direction: "debit",
        occurredAt: now.slice(0, 10),
        description: "moved?",
        note: "",
        isTransfer: false,
      },
    });
    expect(res.status()).toBe(422);
    expect(JSON.stringify(await res.json())).toContain("A bank transaction stays on the account it came from.");
    const { data: afterApi } = await db.from("transactions").select("account_id, description").eq("id", txn!.id).single();
    expect(afterApi).toEqual({ account_id: bankAccount!.id, description: "Imported bank coffee, noted" });
  } finally {
    await db.from("plaid_items").delete().eq("user_id", user.id);
    await deleteTestUser(user.id);
  }
});
