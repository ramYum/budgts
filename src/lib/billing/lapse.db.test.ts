// @vitest-environment node
/**
 * The lapse sweep against REAL Postgres with the repo's real migration chain (embedded PGlite): who is selected,
 * idempotency, retry after a failed removal, and the ledger surviving the removal.
 *
 * `removeItem` stands in for the shared disconnect (`disconnectPlaidItem(admin, { strict: true })`, unit-tested in
 * src/server/plaid/disconnect.test.ts): on success it deletes the `plaid_items` row exactly as that function does, so
 * the real FK chain (plaid_accounts CASCADE, transactions.plaid_account_id SET NULL) runs here.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asBillingDb, createAuthUser, newMigratedDb } from "../../../tests/unit/helpers/pglite-db";
import type { Db } from "./db";
import { removeLapsedBankConnections, type RemoveItem } from "./lapse";

let pg: PGlite;
let db: Db;
beforeAll(async () => {
  pg = await newMigratedDb();
  db = asBillingDb(pg);
}, 120_000);
afterAll(async () => {
  await pg.close();
});
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const DAY = 86_400_000;
const NOW = new Date("2026-10-20T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

async function seedEntitlement(userId: string, state: string, accessUntil: Date | null) {
  await pg.query(
    `insert into entitlements (user_id, state, provider, store, product_id, trial_started_at, trial_ends_at, access_until)
     values ($1, $2, 'revenuecat', 'apple', 'budgts_monthly', $3, $4, $4)`,
    [userId, state, accessUntil ? new Date(accessUntil.getTime() - 7 * DAY) : null, accessUntil],
  );
}

/** A connected bank with one imported transaction: Budgts account -> Plaid Item -> Plaid account -> transaction. */
async function seedBank(userId: string): Promise<{ itemId: string; txnId: string }> {
  const itemId = `item-${crypto.randomUUID()}`;
  const [acct] = (await pg.query<{ id: string }>(`insert into accounts (user_id, name, type, source) values ($1, 'Checking', 'checking', 'plaid') returning id`, [userId])).rows;
  const [item] = (await pg.query<{ id: string }>(`insert into plaid_items (user_id, item_id, access_token_enc) values ($1, $2, 'enc') returning id`, [userId, itemId])).rows;
  const [pa] = (
    await pg.query<{ id: string }>(
      `insert into plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state) values ($1, $2, $3, $4, 'mapped') returning id`,
      [userId, item.id, `pa-${crypto.randomUUID()}`, acct.id],
    )
  ).rows;
  const [txn] = (
    await pg.query<{ id: string }>(
      `insert into transactions (user_id, account_id, amount, direction, occurred_at, description, source, source_ref, plaid_account_id)
       values ($1, $2, 1250, 'debit', $3, 'Coffee', 'bank', $4, $5) returning id`,
      [userId, acct.id, ago(20), `txn-${crypto.randomUUID()}`, pa.id],
    )
  ).rows;
  return { itemId, txnId: txn.id };
}

/** Behaves like the strict shared disconnect: deletes the local Item row (scoped to the user) when "Plaid" agrees. */
function remover(plaidFails: (itemId: string) => boolean = () => false) {
  const calls: { userId: string; itemId: string }[] = [];
  const fn: RemoveItem = async (userId, itemId) => {
    calls.push({ userId, itemId });
    if (plaidFails(itemId)) return { ok: false, status: 500, error: "could not remove bank connection" };
    const gone = await pg.query(`delete from plaid_items where item_id = $1 and user_id = $2 returning id`, [itemId, userId]);
    return gone.rows.length ? { ok: true } : { ok: false, status: 404, error: "unknown item" };
  };
  return { fn, calls };
}

const itemExists = async (itemId: string) => (await pg.query(`select 1 from plaid_items where item_id = $1`, [itemId])).rows.length === 1;
const sweep = (fn: RemoveItem, limit?: number) => removeLapsedBankConnections({ db, now: () => NOW, removeItem: fn }, { limit: limit ?? 500 });

describe("removeLapsedBankConnections", () => {
  it("selects ONLY users lapsed 7+ days: no row, active, trialing, under-7-days and renewed users keep their banks", async () => {
    const noRow = await createAuthUser(pg);
    const active = await createAuthUser(pg);
    const trial = await createAuthUser(pg);
    const recent = await createAuthUser(pg);
    const renewed = await createAuthUser(pg);
    const lapsed = await createAuthUser(pg);
    const expiredTrial = await createAuthUser(pg);
    await seedEntitlement(active, "active", new Date(NOW.getTime() + 20 * DAY));
    await seedEntitlement(trial, "trialing", new Date(NOW.getTime() + 3 * DAY));
    await seedEntitlement(recent, "expired", ago(6));
    await seedEntitlement(renewed, "active", new Date(NOW.getTime() + 30 * DAY));
    await seedEntitlement(lapsed, "expired", ago(9));
    await seedEntitlement(expiredTrial, "trialing", ago(8)); // the trial ended unpaid; the expiry webhook never came
    const banks = Object.fromEntries(
      await Promise.all([noRow, active, trial, recent, renewed, lapsed, expiredTrial].map(async (u) => [u, await seedBank(u)] as const)),
    );

    const r = remover();
    const result = await sweep(r.fn);

    expect(r.calls.map((c) => c.userId).sort()).toEqual([lapsed, expiredTrial].sort());
    expect(result).toMatchObject({ removed: 2, failed: 0 });
    for (const u of [noRow, active, trial, recent, renewed]) expect(await itemExists(banks[u].itemId)).toBe(true);
    for (const u of [lapsed, expiredTrial]) expect(await itemExists(banks[u].itemId)).toBe(false);
    // The removal is on record for the notice.
    const marks = (await pg.query<{ user_id: string; bank_connections_removed_at: Date | null }>(`select user_id, bank_connections_removed_at from entitlements`)).rows;
    for (const m of marks) expect(m.bank_connections_removed_at !== null).toBe(m.user_id === lapsed || m.user_id === expiredTrial);

    // clean up so later tests see only their own users
    for (const u of [active, trial, recent, renewed]) await pg.query(`delete from entitlements where user_id = $1`, [u]);
  });

  it("keeps the ledger: the transaction survives, detached from the removed connection", async () => {
    const u = await createAuthUser(pg);
    await seedEntitlement(u, "revoked", ago(12));
    const { txnId } = await seedBank(u);

    await sweep(remover().fn);

    const rows = (await pg.query<{ amount: number; plaid_account_id: string | null; removed_at: Date | null }>(`select amount, plaid_account_id, removed_at from transactions where id = $1`, [txnId])).rows;
    expect(rows).toEqual([{ amount: 1250, plaid_account_id: null, removed_at: null }]);
  });

  it("is idempotent: a second run finds nothing left to do", async () => {
    const u = await createAuthUser(pg);
    await seedEntitlement(u, "expired", ago(30));
    await seedBank(u);
    await sweep(remover().fn);

    const again = remover();
    const result = await sweep(again.fn);
    expect(again.calls.filter((c) => c.userId === u)).toEqual([]);
    expect(result).toEqual({ checked: 0, removed: 0, failed: 0 });
  });

  it("a failed removal is logged, the Item is kept, and the next run retries it", async () => {
    const u = await createAuthUser(pg);
    await seedEntitlement(u, "expired", ago(10));
    const { itemId } = await seedBank(u);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const first = await sweep(remover(() => true).fn);
    expect(first).toMatchObject({ failed: 1 });
    expect(await itemExists(itemId)).toBe(true);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("lapse"), expect.objectContaining({ itemId }));
    const [mark] = (await pg.query<{ bank_connections_removed_at: Date | null }>(`select bank_connections_removed_at from entitlements where user_id = $1`, [u])).rows;
    expect(mark.bank_connections_removed_at).toBeNull(); // nothing was removed, so the notice does not claim it

    const retry = remover();
    const second = await sweep(retry.fn);
    expect(retry.calls).toEqual([{ userId: u, itemId }]);
    expect(second).toMatchObject({ removed: 1, failed: 0 });
    expect(await itemExists(itemId)).toBe(false);
  });

  it("a thrown error from one Item does not stop the others", async () => {
    const u = await createAuthUser(pg);
    await seedEntitlement(u, "expired", ago(10));
    const a = await seedBank(u);
    const b = await seedBank(u);
    const r = remover();
    const result = await removeLapsedBankConnections(
      {
        db,
        now: () => NOW,
        removeItem: async (userId, itemId) => {
          if (itemId === a.itemId) throw new Error("boom");
          return r.fn(userId, itemId);
        },
      },
      { limit: 500 },
    );
    expect(result).toMatchObject({ removed: 1, failed: 1 });
    expect(await itemExists(a.itemId)).toBe(true);
    expect(await itemExists(b.itemId)).toBe(false);
    await sweep(remover().fn); // tidy: removes a
  });

  it("leaves a user whose account deletion has started to the deletion", async () => {
    const u = await createAuthUser(pg);
    await seedEntitlement(u, "expired", ago(10));
    const { itemId } = await seedBank(u);
    await pg.query(`insert into account_deletions (user_id) values ($1)`, [u]);
    const r = remover();
    await sweep(r.fn);
    expect(r.calls.filter((c) => c.userId === u)).toEqual([]);
    expect(await itemExists(itemId)).toBe(true);
  });

  it("is a no-op when no lapsed user has a bank", async () => {
    const u = await createAuthUser(pg);
    await seedEntitlement(u, "expired", ago(10)); // lapsed, but nothing connected
    const r = remover();
    const result = await sweep(r.fn);
    expect(r.calls.filter((c) => c.userId === u)).toEqual([]);
    expect(result.removed + result.failed).toBe(result.checked);
  });
});
