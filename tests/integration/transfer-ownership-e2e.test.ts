/**
 * DB-integration: the complete Transfer Ownership behavior end to end --
 * Task 3's write (transaction-update.ts) -> Task 2's sync protection
 * (apply-sync.ts / sync-store.ts / sync-engine.ts) -> Task 4's precedence
 * (qualify.ts), all against real budgts-staging Postgres. Proves the thing
 * no single task's own tests can: that an explicit user transfer decision
 * genuinely survives a subsequent machine sync AND correctly outranks the
 * machine-resolved event role in the qualifying math -- and that a row the
 * user never touched is completely unaffected, decided by the role exactly
 * as before this plan existed. Design: 2026-09-12 transfer-ownership.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BudgetTxn } from "@/lib/budget/types";
import { countsForMonth } from "@/lib/budget/qualify";
import { runSync } from "@/lib/plaid/sync-engine";
import { createPlaidSyncStore } from "@/lib/plaid/sync-store";
import type { NormalizeCtx, PlaidTxnInput } from "@/lib/plaid/types";
import { updateTransactionRow } from "@/server/transaction-update";
import { adminSupabase, cleanupUser, client, db, insertBankTxn, mainAccountId, readTxn, seedUser } from "./_db";

const store = createPlaidSyncStore(db);
const supabase = adminSupabase();
const ITEM_ID = `itest-e2e-item-${Date.now()}`;
const PLAID_ACCOUNT_EXTERNAL_ID = `itest-e2e-pa-${Date.now()}`;

let userId: string;
let accountId: string;
let plaidAccountRowId: string;

beforeAll(async () => {
  userId = await seedUser();
  accountId = await mainAccountId(userId);

  const [item] = await client<{ id: string }[]>`
    insert into public.plaid_items (user_id, item_id, access_token_enc)
    values (${userId}, ${ITEM_ID}, 'itest-not-a-real-token')
    returning id`;
  const [pa] = await client<{ id: string }[]>`
    insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name)
    values (${userId}, ${item.id}, ${PLAID_ACCOUNT_EXTERNAL_ID}, ${accountId}, 'mapped', 'Checking (e2e)')
    returning id`;
  plaidAccountRowId = pa.id;
});

afterAll(async () => {
  await cleanupUser(userId);
});

// accountMap must be built AFTER beforeAll assigns plaidAccountRowId, so
// this is a function (called per test), not a module-scope constant.
function ctxFor(): NormalizeCtx {
  return {
    accountMap: new Map([
      [PLAID_ACCOUNT_EXTERNAL_ID, { plaidAccountRowId, budgtsAccountId: accountId, ignored: false, signConvention: "standard" }],
    ]),
    currency: "USD",
    resolveCategory: () => null,
  };
}

/** A spend-shaped Plaid `modified` event: normalizes to isTransfer=false,
 * eventRole="PURCHASE" -- a role that would otherwise qualify as spend. */
function purchaseInput(transactionId: string): PlaidTxnInput {
  return {
    transaction_id: transactionId,
    account_id: PLAID_ACCOUNT_EXTERNAL_ID,
    amount: 42,
    iso_currency_code: "USD",
    unofficial_currency_code: null,
    date: "2026-09-10",
    name: "Synthetic Coffee",
    merchant_name: "Synthetic Coffee",
    merchant_entity_id: null,
    pending: false,
    pending_transaction_id: null,
    personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE", confidence_level: "HIGH" },
  };
}

function toBudgetTxn(row: Awaited<ReturnType<typeof readTxn>>, eventRole: string | null): BudgetTxn {
  return {
    categoryId: row.category_id,
    amount: 1000,
    direction: "debit",
    occurredAt: new Date("2026-09-10T12:00:00Z"),
    status: "confirmed",
    isTransfer: row.is_transfer,
    duplicateOfId: null,
    eventRole: eventRole as BudgetTxn["eventRole"],
    transferUserSet: row.transfer_user_set,
  };
}

describe("Transfer Ownership — end-to-end precedence across a real sync (staging Postgres)", () => {
  it("an explicit user transfer decision survives a subsequent machine sync and outranks a qualifying machine role", async () => {
    const sourceRef = `itest-e2e-override-${Date.now()}`;
    const id = await insertBankTxn(userId, accountId, { sourceRef, isTransfer: false, transferUserSet: false });

    // Task 3: the user explicitly marks this row as a transfer.
    const write = await updateTransactionRow(supabase, id, {
      accountId,
      categoryId: null,
      amount: 1000,
      direction: "debit",
      occurredAt: "2026-09-10T12:00:00.000Z",
      description: "User-marked transfer",
      note: null,
      isTransfer: true,
    });
    expect(write.outcome).toBe("ok");
    const afterWrite = await readTxn(id);
    expect(afterWrite.is_transfer).toBe(true);
    expect(afterWrite.transfer_user_set).toBe(true);

    // Task 2: a real machine sync now tries to reclassify this same
    // transaction as ordinary spend (PURCHASE, isTransfer=false) -- the
    // opposite of the user's decision.
    const out = await runSync({
      userId,
      itemId: ITEM_ID,
      initialCursor: `${sourceRef}-cursor-pre`,
      transactionsSync: async () => ({
        added: [],
        modified: [purchaseInput(sourceRef)],
        removed: [],
        next_cursor: `${sourceRef}-cursor-post`,
        has_more: false,
      }),
      store,
      normalizeCtx: ctxFor(),
    });
    expect(out.applied.updates).toBe(1);

    const afterSync = await readTxn(id);
    // Task 2's protection held: the user's is_transfer survives the sync.
    expect(afterSync.is_transfer).toBe(true);
    expect(afterSync.transfer_user_set).toBe(true);
    // event_role is NOT protected (by design -- it's unconditional) and
    // does get overwritten by the sync; read it directly to build the
    // exact BudgetTxn qualify.ts would see.
    const [{ event_role: eventRole }] = await client<{ event_role: string | null }[]>`
      select event_role from public.transactions where id = ${id}`;
    expect(eventRole).toBe("PURCHASE"); // the machine's fresh classification

    // Task 4: even though the fresh machine role (PURCHASE) would qualify
    // as spend, the user's explicit transfer decision outranks it.
    const budgetTxn = toBudgetTxn(afterSync, eventRole);
    expect(countsForMonth(budgetTxn, "2026-09")).toBe(false);
  });

  it("no-user-decision path: a row the user never touched is decided by the machine role exactly as before", async () => {
    const sourceRef = `itest-e2e-no-override-${Date.now()}`;
    const id = await insertBankTxn(userId, accountId, { sourceRef, isTransfer: false, transferUserSet: false });

    // A real sync classifies it as ordinary spend -- no updateTransactionRow
    // call ever happens for this row.
    const out = await runSync({
      userId,
      itemId: ITEM_ID,
      initialCursor: `${sourceRef}-cursor-pre`,
      transactionsSync: async () => ({
        added: [],
        modified: [purchaseInput(sourceRef)],
        removed: [],
        next_cursor: `${sourceRef}-cursor-post`,
        has_more: false,
      }),
      store,
      normalizeCtx: ctxFor(),
    });
    expect(out.applied.updates).toBe(1);

    const afterSync = await readTxn(id);
    expect(afterSync.transfer_user_set).toBe(false);
    const [{ event_role: eventRole }] = await client<{ event_role: string | null }[]>`
      select event_role from public.transactions where id = ${id}`;
    expect(eventRole).toBe("PURCHASE");

    // transferUserSet is false, so the role branch decides -- exactly the
    // same outcome Task 4 produced before this test existed.
    const budgetTxn = toBudgetTxn(afterSync, eventRole);
    expect(countsForMonth(budgetTxn, "2026-09")).toBe(true);
  });
});
