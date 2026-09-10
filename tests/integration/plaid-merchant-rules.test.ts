/**
 * DB-integration: plaid_merchant_rules against budgts-staging. Synthetic data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteMerchantRule, loadMerchantRules, upsertMerchantRule } from "@/lib/plaid/merchant-rules";
import { categoryIdByName, cleanupUser, client, db, seedUser } from "./_db";

let userId: string;
let food: string;
let ent: string;

beforeAll(async () => {
  userId = await seedUser();
  food = await categoryIdByName(userId, "Food / Groceries");
  ent = await categoryIdByName(userId, "Entertainment");
});
afterAll(async () => {
  await cleanupUser(userId);
  await client.end();
});

describe("plaid_merchant_rules (staging Postgres)", () => {
  it("upsert creates a rule, then re-points it on conflict (unique user_id+merchant)", async () => {
    await upsertMerchantRule(db, userId, "ent-netflix", ent);
    expect((await loadMerchantRules(db, userId)).get("ent-netflix")).toBe(ent);

    await upsertMerchantRule(db, userId, "ent-netflix", food); // re-point
    const map = await loadMerchantRules(db, userId);
    expect(map.get("ent-netflix")).toBe(food);
    const [{ n }] = await client<{ n: string }[]>`
      select count(*)::text n from public.plaid_merchant_rules where user_id = ${userId} and merchant_entity_id = 'ent-netflix'`;
    expect(Number(n)).toBe(1); // upsert, not a second row
  });

  it("loadMerchantRules is scoped to the user", async () => {
    const other = await seedUser();
    try {
      expect((await loadMerchantRules(db, other)).size).toBe(0);
    } finally {
      await cleanupUser(other);
    }
  });

  it("delete removes the rule", async () => {
    await upsertMerchantRule(db, userId, "ent-spotify", ent);
    await deleteMerchantRule(db, userId, "ent-spotify");
    expect((await loadMerchantRules(db, userId)).has("ent-spotify")).toBe(false);
  });
});
