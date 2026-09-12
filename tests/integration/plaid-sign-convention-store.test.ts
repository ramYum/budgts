/**
 * DB-integration: getSignConventionEvidence / finalizeSignConvention against
 * budgts-staging Postgres. Synthetic fixtures only.
 *
 * Both methods are keyed on `plaid_accounts.id` (the specific connected feed),
 * never the Budgts `accounts.id` — a user can map two Plaid accounts to one
 * Budgts account, and pooling their evidence would let one institution's feed
 * sign-invert another's genuinely-correct transactions.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPlaidSyncStore } from "@/lib/plaid/sync-store";
import { cleanupUser, client, insertBankTxn, mainAccountId, seedUser } from "./_db";
import { db } from "./_db";

const store = createPlaidSyncStore(db);

let userId: string;
let accountId: string;
let plaidAccountRowId: string;
/** A SECOND Plaid account deliberately mapped to the SAME Budgts account. */
let otherPlaidAccountRowId: string;

beforeAll(async () => {
  userId = await seedUser();
  accountId = await mainAccountId(userId);
  const [item] = await client<{ id: string }[]>`
    insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status, needs_sync)
    values (${userId}, ${`itest-item-${Date.now()}`}, 'Synthetic Bank', 'enc-blob', 'active', true) returning id`;
  const [pa] = await client<{ id: string }[]>`
    insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name)
    values (${userId}, ${item.id}, 'itest-sc-pa-1', ${accountId}, 'mapped', 'Checking') returning id`;
  plaidAccountRowId = pa.id;
  const [pa2] = await client<{ id: string }[]>`
    insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name)
    values (${userId}, ${item.id}, 'itest-sc-pa-2', ${accountId}, 'mapped', 'Second Card') returning id`;
  otherPlaidAccountRowId = pa2.id;
});

afterAll(async () => {
  await cleanupUser(userId);
});

async function readTxn(id: string) {
  const [row] = await client<
    { status: string; direction: string; pending_reason: string | null }[]
  >`select status, direction, pending_reason from public.transactions where id = ${id}`;
  return row;
}

async function readConvention(plaidRowId: string) {
  const [row] = await client<{ sign_convention: string }[]>`
    select sign_convention from public.plaid_accounts where id = ${plaidRowId}`;
  return row.sign_convention;
}

describe("getSignConventionEvidence / finalizeSignConvention", () => {
  it("only finalizes rows pending for the sign-unknown reason, leaving a currency-mismatch row and an already-confirmed row untouched", async () => {
    const rowA = await insertBankTxn(userId, accountId, {
      plaidAccountId: plaidAccountRowId,
      status: "pending_review",
      pendingReason: "sign_convention_unknown",
      direction: "debit",
      primary: "FOOD_AND_DRINK",
      raw: { amount: 12.34 },
    });
    const rowB = await insertBankTxn(userId, accountId, {
      plaidAccountId: plaidAccountRowId,
      status: "pending_review",
      pendingReason: "currency_mismatch",
      direction: "debit",
      raw: { amount: 9.99 },
    });
    const rowC = await insertBankTxn(userId, accountId, {
      plaidAccountId: plaidAccountRowId,
      status: "confirmed",
      pendingReason: null,
      direction: "credit",
      raw: { amount: -50 },
    });

    const evidence = await store.getSignConventionEvidence([plaidAccountRowId]);
    // only row A counts — and its rawAmount comes from the immutable `raw`
    // payload, not from the (user-editable) `direction` column
    expect(evidence.get(plaidAccountRowId)).toEqual([{ rawAmount: 12.34, primary: "FOOD_AND_DRINK" }]);

    await store.finalizeSignConvention(plaidAccountRowId, "inverted");

    const a = await readTxn(rowA);
    expect(a.status).toBe("confirmed");
    expect(a.direction).toBe("credit"); // flipped — convention resolved to inverted
    expect(a.pending_reason).toBeNull();

    const b = await readTxn(rowB);
    expect(b.status).toBe("pending_review"); // untouched — different pending reason
    expect(b.direction).toBe("debit");

    const c = await readTxn(rowC);
    expect(c.status).toBe("confirmed"); // untouched — was never pending
    expect(c.direction).toBe("credit");

    expect(await readConvention(plaidAccountRowId)).toBe("inverted");
  });

  it("leaves direction unchanged when the resolved convention is standard", async () => {
    const rowA = await insertBankTxn(userId, accountId, {
      plaidAccountId: plaidAccountRowId,
      status: "pending_review",
      pendingReason: "sign_convention_unknown",
      direction: "debit",
      raw: { amount: 3.5 },
    });

    await store.finalizeSignConvention(plaidAccountRowId, "standard");

    const a = await readTxn(rowA);
    expect(a.status).toBe("confirmed");
    expect(a.direction).toBe("debit"); // unchanged
  });

  it("derives evidence from the immutable raw payload, never from the user-editable direction column", async () => {
    // `direction` is editable by the user on any transaction (updateTransaction
    // has no source='manual' guard). If evidence were reconstructed from it, a
    // user "correcting" a sign would cast a vote that a later finalize would
    // then silently revert. `raw.amount` is what Plaid actually sent.
    const row = await insertBankTxn(userId, accountId, {
      plaidAccountId: otherPlaidAccountRowId,
      status: "pending_review",
      pendingReason: "sign_convention_unknown",
      direction: "credit", // as if a user had flipped it by hand
      primary: "FOOD_AND_DRINK",
      raw: { amount: 42.5 }, // Plaid's original: positive
    });

    const evidence = await store.getSignConventionEvidence([otherPlaidAccountRowId]);
    // +42.5 from `raw`, NOT the -1 the old direction-derived code produced
    expect(evidence.get(otherPlaidAccountRowId)).toEqual([{ rawAmount: 42.5, primary: "FOOD_AND_DRINK" }]);

    // cleanup so the isolation test below starts from a known state
    await client`delete from public.transactions where id = ${row}`;
  });

  it("never pools evidence across two Plaid accounts mapped to the SAME Budgts account, and finalizing one never touches the other", async () => {
    const onFeed1 = await insertBankTxn(userId, accountId, {
      plaidAccountId: plaidAccountRowId,
      status: "pending_review",
      pendingReason: "sign_convention_unknown",
      direction: "debit",
      primary: "FOOD_AND_DRINK",
      raw: { amount: -7.25 }, // an inverted-looking feed
    });
    const onFeed2 = await insertBankTxn(userId, accountId, {
      plaidAccountId: otherPlaidAccountRowId,
      status: "pending_review",
      pendingReason: "sign_convention_unknown",
      direction: "debit",
      primary: "FOOD_AND_DRINK",
      raw: { amount: 7.25 }, // a correct, standard feed — must not be dragged along
    });

    const evidence = await store.getSignConventionEvidence([plaidAccountRowId, otherPlaidAccountRowId]);
    expect(evidence.get(plaidAccountRowId)).toEqual([{ rawAmount: -7.25, primary: "FOOD_AND_DRINK" }]);
    expect(evidence.get(otherPlaidAccountRowId)).toEqual([{ rawAmount: 7.25, primary: "FOOD_AND_DRINK" }]);

    await store.finalizeSignConvention(plaidAccountRowId, "inverted");

    const flipped = await readTxn(onFeed1);
    expect(flipped.status).toBe("confirmed");
    expect(flipped.direction).toBe("credit");

    // The second feed's row shares a Budgts account with the first. Under the
    // old accounts.id keying it would have been confirmed AND sign-flipped
    // here — silently corrupting a correct transaction.
    const untouched = await readTxn(onFeed2);
    expect(untouched.status).toBe("pending_review");
    expect(untouched.direction).toBe("debit");
    expect(untouched.pending_reason).toBe("sign_convention_unknown");
    expect(await readConvention(otherPlaidAccountRowId)).toBe("unknown");
  });
});
