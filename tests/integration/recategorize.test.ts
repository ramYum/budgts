/**
 * DB-integration: `recategorizeUncategorizedBankTxns` (the "Re-scan" helper,
 * design §18) against budgts-staging. Synthetic data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recategorizeUncategorizedBankTxns } from "@/lib/plaid/recategorize";
import { categoryIdByName, cleanupUser, client, db, insertBankTxn, mainAccountId, readTxn, seedUser } from "./_db";

let userId: string;
let acct: string;
let transport: string;
let food: string;
let personalCare: string;

beforeAll(async () => {
  userId = await seedUser();
  acct = await mainAccountId(userId);
  transport = await categoryIdByName(userId, "Transportation");
  food = await categoryIdByName(userId, "Food / Groceries");
  personalCare = await categoryIdByName(userId, "Personal Care");
});
afterAll(async () => {
  await cleanupUser(userId);
  await client.end();
});

describe("recategorizeUncategorizedBankTxns (staging Postgres)", () => {
  it("categorises the resolvable backlog, leaves ambiguity and protected rows alone, is idempotent", async () => {
    // R2 merchant knowledge, LOW confidence, no entity id
    const uber = await insertBankTxn(userId, acct, {
      merchantName: "Uber",
      primary: "TRANSPORTATION",
      detailed: "TRANSPORTATION_TAXIS_AND_RIDE_SHARES",
      confidence: "LOW",
    });
    // R2 via merchant name, no PFC at all
    const mcd = await insertBankTxn(userId, acct, { merchantName: "McDonald's", description: "MCDONALDS #42" });
    // R3 trusted detailed, LOW confidence, unknown merchant
    const cafe = await insertBankTxn(userId, acct, {
      merchantName: "Corner Cafe LLC",
      detailed: "FOOD_AND_DRINK_COFFEE",
      primary: "FOOD_AND_DRINK",
      confidence: "LOW",
    });
    // genuinely ambiguous → must stay null
    const amazon = await insertBankTxn(userId, acct, {
      merchantName: "Amazon",
      primary: "GENERAL_MERCHANDISE",
      confidence: "HIGH",
    });
    // protected
    const userSet = await insertBankTxn(userId, acct, {
      merchantName: "Uber",
      categoryId: personalCare,
      userCategorized: true,
    });
    const removed = await insertBankTxn(userId, acct, {
      merchantName: "Uber",
      removedAt: new Date().toISOString(),
    });

    const first = await recategorizeUncategorizedBankTxns(db, userId);
    expect(first.updated).toBe(3);

    expect((await readTxn(uber)).category_id).toBe(transport);
    expect((await readTxn(mcd)).category_id).toBe(food);
    expect((await readTxn(cafe)).category_id).toBe(food);
    expect((await readTxn(amazon)).category_id).toBeNull();
    expect(await readTxn(userSet)).toMatchObject({ category_id: personalCare, user_categorized: true });
    expect((await readTxn(removed)).category_id).toBeNull();

    // auto assignments never claim the row
    expect((await readTxn(uber)).user_categorized).toBe(false);

    const second = await recategorizeUncategorizedBankTxns(db, userId);
    expect(second.updated).toBe(0);
  });
});
