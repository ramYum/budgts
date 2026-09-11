/**
 * DB-integration: the correction backfill in `categorizeBankTransaction`
 * (design §18) against budgts-staging. Synthetic data.
 *
 * The server action needs an auth session, so this test runs the EXACT backfill
 * predicate as raw SQL — the same `.eq/.is` chain the action issues through the
 * RLS client — to lock down its scope + guards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categoryIdByName, cleanupUser, client, insertBankTxn, mainAccountId, readTxn, seedUser } from "./_db";

let userId: string;
let acct: string;
let transport: string;
let personalCare: string;

const ENT = "ent-uber-backfill";

async function backfill(uid: string, entityId: string, targetCategoryId: string) {
  // Mirrors: supabase.from("transactions").update({ category_id })
  //   .eq("source","bank").eq("merchant_entity_id", ...).is("category_id", null)
  //   .eq("user_categorized", false).is("removed_at", null).eq("is_transfer", false)
  // (RLS adds user_id = auth.uid(); here we filter user_id explicitly).
  await client`
    update public.transactions set category_id = ${targetCategoryId}
    where user_id = ${uid}
      and source = 'bank'
      and merchant_entity_id = ${entityId}
      and category_id is null
      and user_categorized = false
      and removed_at is null
      and is_transfer = false`;
}

beforeAll(async () => {
  userId = await seedUser();
  acct = await mainAccountId(userId);
  transport = await categoryIdByName(userId, "Transportation");
  personalCare = await categoryIdByName(userId, "Personal Care");
});
afterAll(async () => {
  await cleanupUser(userId);
  await client.end();
});

describe("categorize backfill (staging Postgres)", () => {
  it("fills only the safe blanks for the same merchant, scoped to the user", async () => {
    const blankA = await insertBankTxn(userId, acct, { merchantEntityId: ENT });
    const blankB = await insertBankTxn(userId, acct, { merchantEntityId: ENT });
    const userSet = await insertBankTxn(userId, acct, {
      merchantEntityId: ENT,
      categoryId: personalCare,
      userCategorized: true,
    });
    const removed = await insertBankTxn(userId, acct, {
      merchantEntityId: ENT,
      removedAt: new Date().toISOString(),
    });
    const transfer = await insertBankTxn(userId, acct, { merchantEntityId: ENT, isTransfer: true });
    const alreadyAuto = await insertBankTxn(userId, acct, {
      merchantEntityId: ENT,
      categoryId: personalCare, // a non-user auto guess
      userCategorized: false,
    });
    const otherMerchant = await insertBankTxn(userId, acct, { merchantEntityId: "ent-something-else" });

    const other = await seedUser();
    const otherUserRow = await insertBankTxn(other, await mainAccountId(other), { merchantEntityId: ENT });

    try {
      await backfill(userId, ENT, transport);

      // filled
      expect(await readTxn(blankA)).toMatchObject({ category_id: transport, user_categorized: false });
      expect(await readTxn(blankB)).toMatchObject({ category_id: transport, user_categorized: false });
      // untouched
      expect(await readTxn(userSet)).toMatchObject({ category_id: personalCare, user_categorized: true });
      expect((await readTxn(removed)).category_id).toBeNull();
      expect((await readTxn(transfer)).category_id).toBeNull();
      expect(await readTxn(alreadyAuto)).toMatchObject({ category_id: personalCare }); // blanks only
      expect((await readTxn(otherMerchant)).category_id).toBeNull();
      expect((await readTxn(otherUserRow)).category_id).toBeNull(); // other user, not reached
    } finally {
      await cleanupUser(other);
    }
  });

  it("is idempotent — a second run changes nothing", async () => {
    const blank = await insertBankTxn(userId, acct, { merchantEntityId: "ent-idem" });
    await backfill(userId, "ent-idem", transport);
    expect((await readTxn(blank)).category_id).toBe(transport);
    await backfill(userId, "ent-idem", personalCare); // now non-null → predicate excludes it
    expect((await readTxn(blank)).category_id).toBe(transport); // unchanged
  });
});
