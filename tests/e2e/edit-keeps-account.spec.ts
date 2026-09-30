import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { createTestUser, deleteTestUser, hasAdminCredentials, magicTokenHash } from "./helpers/test-user";
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
