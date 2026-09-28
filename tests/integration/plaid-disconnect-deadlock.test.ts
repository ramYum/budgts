/**
 * Disconnect vs. a concurrent sync, against REAL Postgres (budgts-staging).
 *
 * Reproduced on staging by repeated e2e runs: the background sync (pg_cron, every ~30s) locks
 * `transactions` rows and only then updates its parent `plaid_items` row, while a disconnect deletes
 * that parent row first and lets the FK cascade (`transactions.plaid_account_id ... ON DELETE SET
 * NULL`) reach the same transactions. Opposite lock order => Postgres detects a deadlock (40P01) and
 * aborts one side. When the disconnect was the victim, Plaid had already removed the Item and the
 * user was told "could not disconnect".
 *
 * The unit tests fake the database, so they can only prove the retry logic. This builds the real
 * cycle: a transaction takes its locks in the sync's order, a real disconnect is started, and only
 * once Postgres shows the disconnect blocked on the transaction's lock does the transaction reach
 * for the parent row and close the cycle.
 *
 * Plaid itself is stubbed: this is about the database step that follows Plaid's removal.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptToken } from "@/lib/plaid/crypto";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { disconnectPlaidItem } from "@/server/plaid/disconnect";
import { adminSupabase, cleanupUser, client as pg, insertBankTxn, mainAccountId, seedUser } from "./_db";

vi.mock("@/lib/plaid/client", () => ({ plaidClient: () => ({ itemRemove: async () => ({ data: {} }) }) }));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const cleanupIds: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const id of cleanupIds.splice(0)) await cleanupUser(id);
});

/** A user with one Plaid Item, one Plaid account and one imported bank transaction. */
async function seedConnectedBank() {
  const userId = await seedUser();
  cleanupIds.push(userId);
  const accountId = await mainAccountId(userId);
  const plaidItemId = `itest-item-${crypto.randomUUID()}`;
  const tokenEnc = encryptToken(`itest-fake-access-token-${crypto.randomUUID()}`, loadPlaidConfig().tokenEncKey);
  const [item] = await pg<{ id: string }[]>`
    insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status)
    values (${userId}, ${plaidItemId}, 'Itest Bank', ${tokenEnc}, 'active') returning id`;
  const [pa] = await pg<{ id: string }[]>`
    insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name)
    values (${userId}, ${item.id}, ${`itest-pa-${crypto.randomUUID()}`}, ${accountId}, 'mapped', 'Checking') returning id`;
  const txnId = await insertBankTxn(userId, accountId, { plaidAccountId: pa.id });
  return { userId, plaidItemId, itemRowId: item.id, txnId };
}

/**
 * Resolves once some backend is waiting on a lock inside a `DELETE FROM ... plaid_items` statement.
 * (PostgREST wraps it as `WITH pgrst_source AS (DELETE FROM ...)`, hence the leading wildcard.)
 */
async function waitForDisconnectToBlockOnALock(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await pg`
      select 1 from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock' and query ilike '%delete from%plaid_items%'`;
    if (rows.length) return;
    await sleep(50);
  }
  throw new Error("the disconnect never blocked on a lock; the scenario did not set up");
}

describe("disconnectPlaidItem against a concurrent sync (real Postgres)", () => {
  it("ends in agreement with the database when it collides with a sync: the connection is removed and the history is kept", async () => {
    const bank = await seedConnectedBank();
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    let disconnect!: ReturnType<typeof disconnectPlaidItem>;

    // "Sync": lock the child row first...
    const syncOutcome = await pg
      .begin(async (tx) => {
        await tx`update public.transactions set description = 'itest sync touch' where id = ${bank.txnId}`;

        // ...let a real disconnect start and take the PARENT row's lock...
        disconnect = disconnectPlaidItem(adminSupabase() as never, { userId: bank.userId, itemId: bank.plaidItemId });
        await waitForDisconnectToBlockOnALock();

        // ...then, like the sync's final cursor write, reach for the parent row. That closes the cycle.
        await tx`update public.plaid_items set transactions_cursor = 'itest-cursor' where id = ${bank.itemRowId}`;
      })
      .then(
        () => "sync committed" as const,
        (e: { code?: string }) => e,
      );

    // Whichever side Postgres aborts, the user's disconnect must succeed.
    const outcome = await disconnect;
    const logged = JSON.stringify({ sync: String((syncOutcome as { code?: string }).code ?? syncOutcome), warn: warnings.mock.calls, error: errors.mock.calls });
    expect(outcome, logged).toEqual({ ok: true, purged: false });

    const items = await pg`select 1 from public.plaid_items where id = ${bank.itemRowId}`;
    expect(items).toHaveLength(0); // the connection is gone
    const [txn] = await pg`select plaid_account_id from public.transactions where id = ${bank.txnId}`;
    expect(txn).toBeDefined(); // history is kept...
    expect(txn.plaid_account_id).toBeNull(); // ...detached from the removed connection

    if (syncOutcome === "sync committed") {
      // The disconnect was the victim and the retry absorbed it (so this was not a vacuous pass).
      expect(warnings.mock.calls.some((c) => String(c[0]).includes("retrying after database"))).toBe(true);
    } else {
      // The sync was the victim instead (its next poll retries it): a deadlock, and only that.
      expect(syncOutcome.code).toBe("40P01");
    }
  }, 60_000);
});
