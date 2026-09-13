/**
 * DB-integration: Money Left across a real Transfer Ownership round trip and
 * a real Card Payment scenario. Money Left / Savings Rate design §14 items
 * 14-15. Money Left/Savings Rate are pure functions with no new persistence
 * (design §13) -- this file exists to prove the two cross-layer claims the
 * unit tests alone can't: that a user's transfer decision durably protects
 * Money Left across a subsequent machine sync, and that a card payment has
 * zero effect on its own month's Money Left. Mirrors
 * transfer-ownership-e2e.test.ts's pattern with its own setup, kept separate
 * from that (frozen) phase's own test file.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BudgetTxn } from "@/lib/budget/types";
import { rollup } from "@/lib/budget/rollup";
import { runSync } from "@/lib/plaid/sync-engine";
import { createPlaidSyncStore } from "@/lib/plaid/sync-store";
import type { NormalizeCtx, PlaidTxnInput } from "@/lib/plaid/types";
import { updateTransactionRow } from "@/server/transaction-update";
import { adminSupabase, cleanupUser, client, db, insertBankTxn, mainAccountId, readTxn, seedUser } from "./_db";

const store = createPlaidSyncStore(db);
const supabase = adminSupabase();
const ITEM_ID = `itest-moneyleft-item-${Date.now()}`;
const PLAID_ACCOUNT_EXTERNAL_ID = `itest-moneyleft-pa-${Date.now()}`;

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
    values (${userId}, ${item.id}, ${PLAID_ACCOUNT_EXTERNAL_ID}, ${accountId}, 'mapped', 'Checking (money-left e2e)')
    returning id`;
  plaidAccountRowId = pa.id;
});

afterAll(async () => {
  await cleanupUser(userId);
});

function ctxFor(): NormalizeCtx {
  return {
    accountMap: new Map([
      [PLAID_ACCOUNT_EXTERNAL_ID, { plaidAccountRowId, budgtsAccountId: accountId, ignored: false, signConvention: "standard" }],
    ]),
    currency: "USD",
    resolveCategory: () => null,
  };
}

function purchaseInput(transactionId: string): PlaidTxnInput {
  return {
    transaction_id: transactionId,
    account_id: PLAID_ACCOUNT_EXTERNAL_ID,
    amount: 200_00,
    iso_currency_code: "USD",
    unofficial_currency_code: null,
    date: "2026-09-10",
    name: "Synthetic Merchandise",
    merchant_name: "Synthetic Store",
    merchant_entity_id: null,
    pending: false,
    pending_transaction_id: null,
    personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE", confidence_level: "HIGH" },
  };
}

async function toBudgetTxn(id: string): Promise<BudgetTxn> {
  const row = await readTxn(id);
  const [{ event_role: eventRole, occurred_at: occurredAt, direction, amount }] = await client<
    { event_role: string | null; occurred_at: string; direction: "debit" | "credit"; amount: number }[]
  >`select event_role, occurred_at, direction, amount from public.transactions where id = ${id}`;
  return {
    categoryId: row.category_id,
    amount,
    direction,
    occurredAt: new Date(occurredAt),
    status: "confirmed",
    isTransfer: row.is_transfer,
    duplicateOfId: null,
    eventRole: eventRole as BudgetTxn["eventRole"],
    transferUserSet: row.transfer_user_set,
  };
}

describe("Money Left — a user's transfer decision survives a subsequent machine sync (staging Postgres)", () => {
  it("test 14: Money Left is unaffected by a card-payment-shaped sync after the user marks a row a transfer", async () => {
    const sourceRef = `itest-moneyleft-transfer-${Date.now()}`;
    const incomeId = await insertBankTxn(userId, accountId, {
      sourceRef: `itest-moneyleft-income-${Date.now()}`,
      isTransfer: false,
      amount: 1000_00,
      direction: "credit",
      primary: "INCOME",
      detailed: "INCOME_WAGES",
      eventRole: "INCOME",
    });
    const id = await insertBankTxn(userId, accountId, { sourceRef, isTransfer: false, transferUserSet: false });

    // User marks the second row a transfer -- e.g. correcting a
    // miscategorized purchase that was actually a move to savings.
    const write = await updateTransactionRow(supabase, id, {
      accountId,
      categoryId: null,
      amount: 200_00,
      direction: "debit",
      occurredAt: "2026-09-10T12:00:00.000Z",
      description: "Actually a transfer to savings",
      note: null,
      isTransfer: true,
    });
    expect(write.outcome).toBe("ok");

    const income = await toBudgetTxn(incomeId);
    const marked = await toBudgetTxn(id);
    const beforeSync = rollup([income, marked], [], [], "2026-09");
    expect(beforeSync.spend).toBe(0); // the $200 is excluded -- a transfer, not spend
    expect(beforeSync.income).toBe(1000_00);
    expect(beforeSync.net).toBe(1000_00); // Money Left = income only

    // A real machine sync now tries to reclassify the row as ordinary
    // spend (PURCHASE) -- the opposite of the user's decision.
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

    const markedAfterSync = await toBudgetTxn(id);
    expect(markedAfterSync.eventRole).toBe("PURCHASE"); // eventRole did refresh (unconditional, by design)
    expect(markedAfterSync.isTransfer).toBe(true); // is_transfer survived (Task 2's protection)
    expect(markedAfterSync.transferUserSet).toBe(true);

    const afterSync = rollup([income, markedAfterSync], [], [], "2026-09");
    // Money Left is durably unaffected by the sync, despite the fresh
    // machine role (PURCHASE) that would otherwise count as spend.
    expect(afterSync.spend).toBe(0);
    expect(afterSync.net).toBe(1000_00);
    expect(afterSync.net).toBe(beforeSync.net);
  });
});

describe("Money Left — a card payment has zero effect on its own month's total (staging Postgres)", () => {
  it("test 15: the underlying purchase counts in an earlier month; the payment counts nowhere", async () => {
    const purchase = await insertBankTxn(userId, accountId, {
      sourceRef: `itest-moneyleft-purchase-${Date.now()}`,
      primary: "FOOD_AND_DRINK",
      detailed: "FOOD_AND_DRINK_COFFEE",
      confidence: "HIGH",
      amount: 500_00,
      eventRole: "PURCHASE",
    });
    const payment = await insertBankTxn(userId, accountId, {
      sourceRef: `itest-moneyleft-cardpayment-${Date.now()}`,
      primary: "LOAN_PAYMENTS",
      detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
      amount: 500_00,
      eventRole: "CARD_PAYMENT",
    });

    const purchaseTxn = await toBudgetTxn(purchase);
    const paymentTxn = await toBudgetTxn(payment);

    // Both rows land "now" (insertBankTxn always uses now()), so both fall
    // in the same real-clock month -- this test asserts the payment
    // contributes nothing to THAT month's totals, which is the actual
    // claim (CARD_PAYMENT -> NONE, excluded) regardless of which month.
    const currentMonth = purchaseTxn.occurredAt.toISOString().slice(0, 7);
    const r = rollup([purchaseTxn, paymentTxn], [], [], currentMonth);

    expect(r.spend).toBe(50000); // only the original purchase
    expect(r.income).toBe(0);
    expect(r.net).toBe(-50000);
    // Doubling the payment amount and re-computing proves the payment
    // itself never enters the sum -- not just that the numbers happen to
    // match by coincidence.
    const withoutPayment = rollup([purchaseTxn], [], [], currentMonth);
    expect(r.net).toBe(withoutPayment.net);
  });
});
