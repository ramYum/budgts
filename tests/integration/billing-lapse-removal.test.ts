/**
 * The billing lapse sweep end to end with its PRODUCTION wiring: the real shared disconnect (strict, service-role
 * client) against the REAL Plaid sandbox and staging Postgres/Auth.
 *
 * Staging is shared, so the sweep's `removeItem` is wrapped to act ONLY on this file's users: any other lapsed staging
 * user it selects is refused (and left exactly as it was). This file's users lapsed in the year 2000, so the sweep's
 * oldest-first order reaches them within its per-run bound.
 *
 * Skipped unless PLAID_ENV=sandbox with credentials (it can never run against production Plaid).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Products } from "plaid";
import { fromPostgres } from "@/lib/billing/db";
import { removeLapsedBankConnections, type RemoveItem } from "@/lib/billing/lapse";
import { removeItemViaSharedDisconnect } from "@/lib/billing/lapse-remove";
import { plaidClient } from "@/lib/plaid/client";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { encryptToken } from "@/lib/plaid/crypto";
import { readPlaidError } from "@/lib/plaid/error-policy";
import { adminSupabase } from "@/lib/supabase/admin";
import { client as pg, mainAccountId } from "./_db";

const sandbox = process.env.PLAID_ENV === "sandbox" && !!process.env.PLAID_CLIENT_ID && !!process.env.PLAID_SECRET && !!process.env.PLAID_TOKEN_ENC_KEY;
const FIRST_PLATYPUS_BANK = "ins_109508";
const LAPSED_AT = new Date("2000-01-01T00:00:00Z");

describe.skipIf(!sandbox)("lapse sweep: real shared disconnect, real Plaid sandbox, staging", () => {
  const admin = adminSupabase();
  const users: string[] = [];
  const liveTokens: string[] = [];
  const db = fromPostgres(pg);

  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(async () => {
    for (const t of liveTokens.splice(0)) await plaidClient().itemRemove({ access_token: t }).catch(() => {});
    for (const id of users.splice(0)) await admin.auth.admin.deleteUser(id, false).catch(() => {});
    await pg.end();
  });

  async function mkUser(): Promise<string> {
    const { data, error } = await admin.auth.admin.createUser({ email: `itest-lapse+${crypto.randomUUID()}@example.test`, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    users.push(data.user.id);
    return data.user.id;
  }
  async function realItem() {
    const pub = await plaidClient().sandboxPublicTokenCreate({ institution_id: FIRST_PLATYPUS_BANK, initial_products: [Products.Transactions] });
    const ex = await plaidClient().itemPublicTokenExchange({ public_token: pub.data.public_token });
    liveTokens.push(ex.data.access_token);
    return { accessToken: ex.data.access_token, itemId: ex.data.item_id };
  }
  /** Stores the Item, one mapped account and one imported transaction; returns the transaction id. */
  async function storeBank(userId: string, itemId: string, accessToken: string): Promise<string> {
    const [item] = await pg<{ id: string }[]>`insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status)
      values (${userId}, ${itemId}, 'Sandbox Bank', ${encryptToken(accessToken, loadPlaidConfig().tokenEncKey)}, 'active') returning id`;
    const accountId = await mainAccountId(userId);
    const [pa] = await pg<{ id: string }[]>`insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state)
      values (${userId}, ${item.id}, ${`pa-${itemId}`}, ${accountId}, 'mapped') returning id`;
    const [txn] = await pg<{ id: string }[]>`insert into public.transactions (user_id, account_id, amount, direction, occurred_at, description, source, source_ref, plaid_account_id)
      values (${userId}, ${accountId}, 2599, 'debit', now(), 'Groceries', 'bank', ${`src-${itemId}`}, ${pa.id}) returning id`;
    return txn.id;
  }
  const lapse = (userId: string) => pg`insert into public.entitlements (user_id, state, provider, access_until) values (${userId}, 'expired', 'revenuecat', ${LAPSED_AT.toISOString()})`;
  const statusAtPlaid = async (accessToken: string) => {
    try {
      await plaidClient().itemGet({ access_token: accessToken });
      return "alive";
    } catch (e) {
      return readPlaidError(e)?.error_code ?? "unknown";
    }
  };
  const localRow = async (itemId: string) => (await pg`select 1 from public.plaid_items where item_id = ${itemId}`).length;

  it("removes a lapsed user's real Item at Plaid and locally, keeps the ledger, never touches a user with no entitlement, and retries a failure", async () => {
    const lapsedUser = await mkUser();
    const noRowUser = await mkUser();
    const failingUser = await mkUser();
    const mine = new Set([lapsedUser, noRowUser, failingUser]);

    const lapsedItem = await realItem();
    const txnId = await storeBank(lapsedUser, lapsedItem.itemId, lapsedItem.accessToken);
    await lapse(lapsedUser);

    const keptItem = await realItem();
    await storeBank(noRowUser, keptItem.itemId, keptItem.accessToken); // no entitlements row at all

    const bogusItemId = `itest-bogus-${crypto.randomUUID()}`;
    await storeBank(failingUser, bogusItemId, "access-sandbox-00000000-0000-0000-0000-000000000000"); // Plaid will refuse it
    await lapse(failingUser);

    const onlyMine: RemoveItem = async (userId, itemId) =>
      mine.has(userId) ? removeItemViaSharedDisconnect(userId, itemId) : { ok: false, status: 500, error: "not this test's user" };

    await removeLapsedBankConnections({ db, removeItem: onlyMine }, { limit: 50 });

    // Lapsed: gone at Plaid (no more monthly fee) and locally; the transaction kept, detached; the removal on record.
    expect(await statusAtPlaid(lapsedItem.accessToken)).not.toBe("alive");
    expect(await localRow(lapsedItem.itemId)).toBe(0);
    const [txn] = await pg<{ amount: number; plaid_account_id: string | null; removed_at: Date | null }[]>`
      select amount, plaid_account_id, removed_at from public.transactions where id = ${txnId}`;
    expect(txn).toEqual({ amount: 2599, plaid_account_id: null, removed_at: null });
    const [mark] = await pg<{ bank_connections_removed_at: Date | null }[]>`select bank_connections_removed_at from public.entitlements where user_id = ${lapsedUser}`;
    expect(mark.bank_connections_removed_at).not.toBeNull();

    // No entitlement row: untouched, still alive at Plaid.
    expect(await statusAtPlaid(keptItem.accessToken)).toBe("alive");
    expect(await localRow(keptItem.itemId)).toBe(1);

    // Plaid refused the removal: the Item is kept so the next run retries it, and the next run does try again.
    expect(await localRow(bogusItemId)).toBe(1);
    const calls: string[] = [];
    await removeLapsedBankConnections({ db, removeItem: async (u, i) => (calls.push(i), onlyMine(u, i)) }, { limit: 50 });
    expect(calls).toContain(bogusItemId);
    expect(calls).not.toContain(lapsedItem.itemId); // idempotent: the removed Item is not selected again
    expect(await localRow(bogusItemId)).toBe(1);
  }, 120_000);
});
