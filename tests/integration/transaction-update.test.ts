/**
 * DB-integration: src/server/transaction-update.ts's optimistic
 * conditional update, against the real budgts-staging PostgREST endpoint
 * (via a service-role supabase-js client) — not Drizzle. Proves the
 * `.eq("is_transfer", observed)` conditional-write genuinely affects zero
 * rows under a real contended write, not just in a hand-built mock.
 * Design: 2026-09-12 transfer-ownership §4; spec §10 items 10-14.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  attemptConditionalUpdate,
  readObservedIsTransfer,
  updateTransactionRow,
  type UpdateTransactionFields,
} from "@/server/transaction-update";
import { adminSupabase, cleanupUser, client, insertBankTxn, mainAccountId, readTxn, seedUser } from "./_db";

const supabase = adminSupabase();

let userId: string;
let accountId: string;

beforeAll(async () => {
  userId = await seedUser();
  accountId = await mainAccountId(userId);
});

afterAll(async () => {
  await cleanupUser(userId);
});

function fields(over: Partial<UpdateTransactionFields> = {}): UpdateTransactionFields {
  return {
    accountId,
    categoryId: null,
    amount: 500,
    direction: "debit",
    occurredAt: "2026-09-10T12:00:00.000Z",
    description: "Edited description",
    note: null,
    isTransfer: false,
    ...over,
  };
}

describe("updateTransactionRow — optimistic conditional transfer_user_set write", () => {
  it("test 10: submitted isTransfer differs from stored -> transfer_user_set set to true", async () => {
    const id = await insertBankTxn(userId, accountId, { isTransfer: false, transferUserSet: false });

    const result = await updateTransactionRow(supabase, id, fields({ isTransfer: true }));
    expect(result.outcome).toBe("ok");

    const row = await readTxn(id);
    expect(row.is_transfer).toBe(true);
    expect(row.transfer_user_set).toBe(true);
  });

  it("paired-transfer lifecycle: a genuine isTransfer change clears this row's own transfer_pair_id in the same write", async () => {
    const partnerId = await insertBankTxn(userId, accountId, { isTransfer: true });
    const id = await insertBankTxn(userId, accountId, { isTransfer: true, transferPairId: partnerId });

    const result = await updateTransactionRow(supabase, id, fields({ isTransfer: false }));
    expect(result.outcome).toBe("ok");

    const row = await readTxn(id);
    expect(row.transfer_user_set).toBe(true);
    expect(row.transfer_pair_id).toBeNull();
  });

  it("editing an unrelated field (isTransfer unchanged) never clears an existing transfer_pair_id", async () => {
    const partnerId = await insertBankTxn(userId, accountId, { isTransfer: true });
    const id = await insertBankTxn(userId, accountId, { isTransfer: true, transferPairId: partnerId });

    const result = await updateTransactionRow(supabase, id, fields({ isTransfer: true, description: "renamed" }));
    expect(result.outcome).toBe("ok");

    const row = await readTxn(id);
    expect(row.transfer_user_set).toBe(false);
    expect(row.transfer_pair_id).toBe(partnerId);
  });

  it("test 11: submitted isTransfer equals stored -> transfer_user_set stays untouched (false)", async () => {
    const id = await insertBankTxn(userId, accountId, { isTransfer: false, transferUserSet: false });

    const result = await updateTransactionRow(supabase, id, fields({ isTransfer: false }));
    expect(result.outcome).toBe("ok");

    const row = await readTxn(id);
    expect(row.transfer_user_set).toBe(false);
  });

  it("test 11b: re-submitting the same isTransfer never resets an existing transfer_user_set=true back to false", async () => {
    const id = await insertBankTxn(userId, accountId, { isTransfer: true, transferUserSet: true });

    const result = await updateTransactionRow(supabase, id, fields({ isTransfer: true }));
    expect(result.outcome).toBe("ok");

    const row = await readTxn(id);
    expect(row.transfer_user_set).toBe(true);
  });

  it("test 12: editing an unrelated field with isTransfer unchanged leaves transfer_user_set untouched", async () => {
    const id = await insertBankTxn(userId, accountId, {
      isTransfer: false,
      transferUserSet: false,
      description: "old description",
    });

    const result = await updateTransactionRow(
      supabase,
      id,
      fields({ isTransfer: false, description: "new description text" }),
    );
    expect(result.outcome).toBe("ok");

    const row = await readTxn(id);
    expect(row.transfer_user_set).toBe(false);
    // the unrelated field genuinely updated -- not a no-op write
    expect(row.description).toBe("new description text");
  });

  it("test 14: a genuinely missing row returns 'missing', not a conflict", async () => {
    const result = await updateTransactionRow(supabase, "00000000-0000-0000-0000-000000000000", fields({}));
    expect(result.outcome).toBe("missing");
  });

  it("test 13: a genuine conflict (is_transfer changed since the read) affects zero rows on the first attempt, and the retry succeeds with the fresh, correct decision", async () => {
    const id = await insertBankTxn(userId, accountId, { isTransfer: false, transferUserSet: false });

    // Step 1: the read updateTransactionRow's own first step performs.
    const observed1 = await readObservedIsTransfer(supabase, id);
    expect(observed1).toBe(false);

    // Step 2: simulate a concurrent sync landing between the read and the
    // write -- a real, separate write against real Postgres, not a mock.
    await client`update public.transactions set is_transfer = true where id = ${id}`;

    // Step 3: an attempt filtered on the now-stale observed value must
    // affect zero rows -- this is the exact mechanism the retry logic
    // depends on, proven against real PostgREST, not asserted.
    const first = await attemptConditionalUpdate(supabase, id, observed1!, fields({ isTransfer: false }));
    expect(first).toBe("conflict");

    // The failed attempt must not have written anything.
    const afterConflict = await readTxn(id);
    expect(afterConflict.is_transfer).toBe(true);
    expect(afterConflict.transfer_user_set).toBe(false);

    // Step 4: the retry re-reads the fresh value and recomputes against
    // it -- not the stale one -- and succeeds.
    const observed2 = await readObservedIsTransfer(supabase, id);
    expect(observed2).toBe(true);
    const second = await attemptConditionalUpdate(supabase, id, observed2!, fields({ isTransfer: false }));
    expect(second).toBe("ok");

    const after = await readTxn(id);
    // The user's submitted value (false) wins -- correctly detected as
    // genuinely different from the fresh, post-conflict stored value
    // (true), not the stale one (false) the first attempt started from.
    expect(after.is_transfer).toBe(false);
    expect(after.transfer_user_set).toBe(true);
  });
});
