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
});

async function firstCategoryId(): Promise<string> {
  const [row] = await client<{ id: string }[]>`
    select id from public.categories where user_id = ${userId} limit 1`;
  return row.id;
}
