/**
 * DB-integration: proves the "needs a category" query predicate (shared by
 * transactions/page.tsx and layout.tsx's bell count) excludes a confirmed
 * duplicate (design: 2026-09-12 Phase 15). This predicate is hand-written
 * Supabase-client filter chains in two app routes, not a `src/lib` module —
 * so it's verified here against the exact same condition, run as raw SQL
 * against real Postgres, rather than unit-tested against a function.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupUser, client, insertBankTxn, mainAccountId, seedUser } from "./_db";

let userId: string;
let accountId: string;

beforeAll(async () => {
  userId = await seedUser();
  accountId = await mainAccountId(userId);
});
afterAll(async () => {
  await cleanupUser(userId);
  await client.end();
});

async function needsCategoryIds(): Promise<string[]> {
  const rows = await client<{ id: string }[]>`
    select id from public.transactions
    where user_id = ${userId}
      and source = 'bank'
      and category_id is null
      and removed_at is null
      and is_transfer = false
      and duplicate_of_id is null
      and (
        event_role is null
        or event_role not in ('CARD_PAYMENT', 'CASH_ADVANCE')
        or transfer_user_set = true
      )
    order by occurred_at desc`;
  return rows.map((r) => r.id);
}

describe("needs-a-category query predicate (staging Postgres)", () => {
  it("excludes a confirmed duplicate but keeps its canonical row and an unrelated row", async () => {
    const canonical = await insertBankTxn(userId, accountId, { description: "canonical" });
    const duplicate = await insertBankTxn(userId, accountId, {
      description: "confirmed duplicate",
      duplicateOfId: canonical,
    });
    const unrelated = await insertBankTxn(userId, accountId, { description: "unrelated" });

    const ids = await needsCategoryIds();

    expect(ids).toContain(canonical);
    expect(ids).toContain(unrelated);
    expect(ids).not.toContain(duplicate);
  });

  it("still applies every existing exclusion alongside duplicate_of_id", async () => {
    const categorized = await insertBankTxn(userId, accountId, { categoryId: await firstCategoryId() });
    const transfer = await insertBankTxn(userId, accountId, { isTransfer: true });
    const removed = await insertBankTxn(userId, accountId, { removedAt: new Date().toISOString() });

    const ids = await needsCategoryIds();

    expect(ids).not.toContain(categorized);
    expect(ids).not.toContain(transfer);
    expect(ids).not.toContain(removed);
  });

  it("excludes a CARD_PAYMENT-role row (e.g. paying off a credit card) even though it has no category", async () => {
    const cardPayment = await insertBankTxn(userId, accountId, { eventRole: "CARD_PAYMENT" });
    const unrelated = await insertBankTxn(userId, accountId, { description: "unrelated for card-payment case" });

    const ids = await needsCategoryIds();

    expect(ids).not.toContain(cardPayment);
    expect(ids).toContain(unrelated);
  });

  it("excludes a CASH_ADVANCE-role row the same way", async () => {
    const cashAdvance = await insertBankTxn(userId, accountId, { eventRole: "CASH_ADVANCE" });

    const ids = await needsCategoryIds();

    expect(ids).not.toContain(cashAdvance);
  });

  it("keeps a CARD_PAYMENT row in the queue when the user explicitly overrode the transfer decision", async () => {
    const overridden = await insertBankTxn(userId, accountId, {
      eventRole: "CARD_PAYMENT",
      transferUserSet: true,
    });

    const ids = await needsCategoryIds();

    expect(ids).toContain(overridden);
  });
});

async function firstCategoryId(): Promise<string> {
  const [row] = await client<{ id: string }[]>`
    select id from public.categories where user_id = ${userId} limit 1`;
  return row.id;
}
