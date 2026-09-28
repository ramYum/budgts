/**
 * Account deletion while a LEASED sync is draining the user's bank, against real Postgres (staging).
 *
 * Main's sync pipeline (sync-runner.ts) claims a per-Item lease, syncs as the database owner (bypassing RLS and the
 * deletion write guard) and releases the lease at the end. Deletion does not wait for that lease: it removes the Item
 * at Plaid and locally, then deletes the account. This proves the two interleave safely:
 *   - the deletion completes (Path A) while the sync holds the lease,
 *   - the sync's writes after the deletion fail and are not retried into existence (the user, the account and the Item
 *     are gone, so its release finds no lease), and
 *   - nothing owned by the user survives.
 *
 * Plaid is stubbed (its removal succeeds): this is about the database interleaving, not Plaid.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteAccount } from "@/lib/account/delete-account";
import { encryptToken } from "@/lib/plaid/crypto";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { claimItemForSync, releaseSyncClaim } from "@/lib/plaid/item-store";
import type { SyncItemResult } from "@/lib/plaid/sync-item";
import { drainItem, type SyncRunnerDeps } from "@/lib/plaid/sync-runner";
import { adminSupabase } from "@/lib/supabase/admin";
import { cleanupUser, client as pg, db, insertBankTxn, mainAccountId } from "./_db";

vi.mock("@/lib/plaid/client", () => ({ plaidClient: () => ({ itemRemove: async () => ({ data: {} }) }) }));

const cleanupIds: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const id of cleanupIds.splice(0)) await cleanupUser(id).catch(() => {});
});

async function seedConnectedBank() {
  // A real Auth user (deleteAccount looks the user up through the Auth admin API).
  const { data, error } = await adminSupabase().auth.admin.createUser({
    email: `itest-del-lease+${crypto.randomUUID()}@example.test`,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  const userId = data.user.id;
  cleanupIds.push(userId);
  const accountId = await mainAccountId(userId);
  const plaidItemId = `itest-item-${crypto.randomUUID()}`;
  const tokenEnc = encryptToken(`itest-fake-access-token-${crypto.randomUUID()}`, loadPlaidConfig().tokenEncKey);
  const [item] = await pg<{ id: string }[]>`
    insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status, needs_sync)
    values (${userId}, ${plaidItemId}, 'Itest Bank', ${tokenEnc}, 'active', true) returning id`;
  const [pa] = await pg<{ id: string }[]>`
    insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name)
    values (${userId}, ${item.id}, ${`itest-pa-${crypto.randomUUID()}`}, ${accountId}, 'mapped', 'Checking') returning id`;
  await insertBankTxn(userId, accountId, { plaidAccountId: pa.id });
  return { userId, accountId, plaidItemId, itemRowId: item.id, plaidAccountRowId: pa.id };
}

const ownedRows = async (userId: string) => {
  const [r] = await pg<{ n: number }[]>`
    select ((select count(*) from public.transactions where user_id = ${userId})
          + (select count(*) from public.accounts where user_id = ${userId})
          + (select count(*) from public.plaid_items where user_id = ${userId})
          + (select count(*) from public.plaid_accounts where user_id = ${userId})
          + (select count(*) from public.profiles where id = ${userId}))::int as n`;
  return r.n;
};

describe("account deletion vs. a leased sync (real Postgres)", () => {
  it("completes while the sync holds the Item's lease; the sync's later writes fail and nothing owned survives", async () => {
    const bank = await seedConnectedBank();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    let enteredSync!: () => void;
    const syncStarted = new Promise<void>((resolve) => (enteredSync = resolve));
    let letSyncFinish!: () => void;
    const deletionDone = new Promise<void>((resolve) => (letSyncFinish = resolve));
    const lateWrite: { error?: unknown } = {};

    const deps: SyncRunnerDeps = {
      claim: (itemId, mode) => claimItemForSync(db, itemId, mode),
      release: (itemId, token, resync) => releaseSyncClaim(db, itemId, token, resync),
      now: () => Date.now(),
      async sync(item): Promise<SyncItemResult> {
        // A first page lands while the account still exists...
        await insertBankTxn(bank.userId, bank.accountId, { plaidAccountId: bank.plaidAccountRowId, description: "itest page 1" });
        enteredSync();
        await deletionDone;
        // ...the next one arrives after the deletion: the owner-level connection bypasses RLS and the write guard, so
        // only the foreign keys can refuse it, and they must.
        try {
          await insertBankTxn(bank.userId, bank.accountId, { plaidAccountId: null, description: "itest page 2" });
        } catch (e) {
          lateWrite.error = e;
          throw e;
        }
        return { itemId: item.itemId, ok: true, inserts: 2, updates: 0, softDeletes: 0, skipped: 0, hasMore: false, cursor: "c" };
      },
    };

    const drain = drainItem(deps, bank.plaidItemId, { kind: "requested" }, Date.now() + 60_000).then(
      (results) => ({ results }),
      (error: unknown) => ({ error }),
    );
    await syncStarted;

    // The lease is held right now.
    const [held] = await pg<{ token: string | null }[]>`select sync_claim_token as token from public.plaid_items where id = ${bank.itemRowId}`;
    expect(held?.token).not.toBeNull();

    const result = await deleteAccount(adminSupabase(), bank.userId);
    expect(result).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
    letSyncFinish();

    const outcome = await drain;
    expect("error" in outcome).toBe(true); // the sync failed instead of writing for a deleted user
    expect(lateWrite.error).toBeDefined();
    expect(await ownedRows(bank.userId)).toBe(0);
    const [authUser] = await pg`select 1 from auth.users where id = ${bank.userId}`;
    expect(authUser).toBeUndefined();
  }, 120_000);
});
