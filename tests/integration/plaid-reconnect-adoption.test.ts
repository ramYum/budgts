/**
 * DB-integration (staging Postgres only): disconnect a bank, connect it again, and the new Item's history must not
 * import the kept transactions a second time. Real PlaidSyncStore + runSync; synthetic Plaid pages, no Plaid calls.
 *
 * The disconnect step deletes the plaid_items row exactly as the shared disconnect does (src/server/plaid/disconnect.ts),
 * so the real FK chain detaches the transactions (plaid_account_id SET NULL) and nothing else.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runSync } from "@/lib/plaid/sync-engine";
import { createPlaidSyncStore } from "@/lib/plaid/sync-store";
import type { NormalizeCtx, PlaidTxnInput } from "@/lib/plaid/types";
import { categoryIdByName, cleanupUser, client, db, mainAccountId, seedUser } from "./_db";

const store = createPlaidSyncStore(db);
const stamp = Date.now();
const OLD_ITEM = `itest-reconnect-old-${stamp}`;
const NEW_ITEM = `itest-reconnect-new-${stamp}`;

let userId: string;
let accountId: string;
let entCat: string;

const pTxn = (over: Partial<PlaidTxnInput>): PlaidTxnInput => ({
  transaction_id: "x",
  account_id: "x",
  amount: 10,
  iso_currency_code: "USD",
  unofficial_currency_code: null,
  date: "2026-09-08",
  name: "Coffee",
  merchant_name: "Coffee",
  merchant_entity_id: null,
  pending: false,
  pending_transaction_id: null,
  personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE", confidence_level: "HIGH" },
  ...over,
});

async function connect(itemId: string, plaidAccountExternalId: string, signConvention: "standard" | "unknown") {
  const [item] = await client<{ id: string }[]>`
    insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status)
    values (${userId}, ${itemId}, 'Synthetic Bank', 'enc-blob', 'active') returning id`;
  const [pa] = await client<{ id: string }[]>`
    insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name, sign_convention)
    values (${userId}, ${item.id}, ${plaidAccountExternalId}, ${accountId}, 'mapped', 'Checking', ${signConvention}) returning id`;
  const ctx: NormalizeCtx = {
    accountMap: new Map([[plaidAccountExternalId, { plaidAccountRowId: pa.id, budgtsAccountId: accountId, ignored: false, signConvention, accountType: "depository" }]]),
    currency: "USD",
    resolveCategory: () => null,
  };
  return { plaidAccountRowId: pa.id, ctx };
}

const sync = (itemId: string, ctx: NormalizeCtx, added: PlaidTxnInput[], cursor: string) =>
  runSync({
    userId,
    itemId,
    institutionId: null,
    initialCursor: null,
    transactionsSync: async () => ({ added, modified: [], removed: [], next_cursor: cursor, has_more: false }),
    store,
    normalizeCtx: ctx,
  });

/** What the ledger counts: live, confirmed, non-duplicate bank rows. */
async function counted() {
  const rows = await client<{ source_ref: string; amount: number; direction: string; category_id: string | null; plaid_account_id: string | null }[]>`
    select source_ref, amount, direction, category_id, plaid_account_id from public.transactions
    where user_id = ${userId} and source = 'bank' and removed_at is null and duplicate_of_id is null and status = 'confirmed'
    order by occurred_at, source_ref`;
  return rows;
}

async function liveRows() {
  return client<{ amount: number; direction: string }[]>`
    select amount, direction from public.transactions
    where user_id = ${userId} and source = 'bank' and removed_at is null and duplicate_of_id is null`;
}

beforeAll(async () => {
  userId = await seedUser();
  accountId = await mainAccountId(userId);
  entCat = await categoryIdByName(userId, "Entertainment");
});

afterAll(async () => {
  await cleanupUser(userId);
  await client.end();
});

describe("reconnect adoption (staging Postgres)", () => {
  it("disconnect then reconnect: spend does not double, the user's category survives, the stale pending row goes", async () => {
    // 1. The first connection imports two coffees on one day, a cinema ticket, and a pending gas hold.
    const first = await connect(OLD_ITEM, `itest-old-pa-${stamp}`, "standard");
    await sync(
      OLD_ITEM,
      first.ctx,
      [
        pTxn({ transaction_id: `old-c1-${stamp}`, account_id: `itest-old-pa-${stamp}` }),
        pTxn({ transaction_id: `old-c2-${stamp}`, account_id: `itest-old-pa-${stamp}` }),
        pTxn({ transaction_id: `old-cinema-${stamp}`, account_id: `itest-old-pa-${stamp}`, date: "2026-09-09", amount: 18, name: "Cinema" }),
        pTxn({ transaction_id: `old-gas-${stamp}`, account_id: `itest-old-pa-${stamp}`, date: "2026-09-10", amount: 40, name: "Gas", pending: true }),
      ],
      "old-cursor",
    );
    // The user recategorizes the cinema ticket.
    await client`update public.transactions set category_id = ${entCat}, user_categorized = true
                 where user_id = ${userId} and source_ref = ${`old-cinema-${stamp}`}`;
    const before = await counted();
    expect(before).toHaveLength(4);

    // 2. Disconnect (lapse or user): the Item row goes, the ledger stays, detached.
    await client`delete from public.plaid_items where user_id = ${userId} and item_id = ${OLD_ITEM}`;
    const detached = await client`select count(*)::int n from public.transactions where user_id = ${userId} and source = 'bank' and plaid_account_id is null`;
    expect(detached[0].n).toBe(4);

    // 3. Reconnect: a new Item, new ids, its sign convention not yet known. Its 60-day history re-sends both coffees and
    //    the cinema ticket, the gas hold as POSTED at its final amount, and one genuinely new lunch.
    await new Promise((r) => setTimeout(r, 20)); // the new Plaid account is connected after the kept rows were imported
    const second = await connect(NEW_ITEM, `itest-new-pa-${stamp}`, "unknown");
    const out = await sync(
      NEW_ITEM,
      second.ctx,
      [
        pTxn({ transaction_id: `new-c1-${stamp}`, account_id: `itest-new-pa-${stamp}` }),
        pTxn({ transaction_id: `new-c2-${stamp}`, account_id: `itest-new-pa-${stamp}` }),
        pTxn({ transaction_id: `new-cinema-${stamp}`, account_id: `itest-new-pa-${stamp}`, date: "2026-09-09", amount: 18, name: "Cinema" }),
        pTxn({ transaction_id: `new-gas-${stamp}`, account_id: `itest-new-pa-${stamp}`, date: "2026-09-10", amount: 42, name: "Gas" }),
        pTxn({ transaction_id: `new-lunch-${stamp}`, account_id: `itest-new-pa-${stamp}`, date: "2026-09-11", amount: 15, name: "Lunch" }),
      ],
      "new-cursor",
    );
    expect(out.applied).toMatchObject({ inserts: 2, updates: 3, softDeletes: 1 });

    // The three re-sent purchases are the kept rows, now owned by the new connection, still confirmed and counted once.
    const after = await counted();
    const kept = after.filter((r) => r.plaid_account_id === second.plaidAccountRowId);
    expect(kept.map((r) => r.source_ref).sort()).toEqual([`new-c1-${stamp}`, `new-c2-${stamp}`, `new-cinema-${stamp}`].sort());
    expect(kept.find((r) => r.source_ref === `new-cinema-${stamp}`)?.category_id).toBe(entCat);
    // The stale pending gas hold is gone; the posted gas and the lunch wait for the new account's sign check (held,
    // never counted until then), exactly as on any first connection.
    const gas = await client`select removed_at from public.transactions where user_id = ${userId} and source_ref = ${`old-gas-${stamp}`}`;
    expect(gas[0].removed_at).not.toBeNull();
    const total = (rows: { amount: number; direction: string }[]) => rows.filter((r) => r.direction === "debit").reduce((n, r) => n + Number(r.amount), 0);
    // Before: 10 + 10 + 18 + 40 (pending) = 78.00. After, every live row (counted or still held for the sign check):
    // 10 + 10 + 18 + 42 (posted) + 15 (new) = 95.00. Without adoption it would be 10+10+18+40 + 10+10+18+42+15 = 173.00.
    expect(total(before)).toBe(7800);
    expect(total(await liveRows())).toBe(9500);
    const allLive = await client`select count(*)::int n from public.transactions where user_id = ${userId} and source = 'bank' and removed_at is null`;
    expect(allLive[0].n).toBe(5); // 2 coffees + cinema + posted gas + lunch: one row per real purchase

    // 4. Re-running the same page is idempotent: nothing new lands, nothing is re-adopted.
    const again = await sync(NEW_ITEM, second.ctx, [pTxn({ transaction_id: `new-c1-${stamp}`, account_id: `itest-new-pa-${stamp}` })], "new-cursor-2");
    expect(again.applied.inserts).toBe(0);
    const allLiveAgain = await client`select count(*)::int n from public.transactions where user_id = ${userId} and source = 'bank' and removed_at is null`;
    expect(allLiveAgain[0].n).toBe(5);
  });
});
