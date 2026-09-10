/**
 * DB-integration: plaid_items helpers against budgts-staging. Synthetic data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findItemByPlaidItemId,
  findItemsToSync,
  markItemNeedsSync,
  recordSyncFailure,
  setItemStatus,
} from "@/lib/plaid/item-store";
import { cleanupUser, client, db, seedUser } from "./_db";

let userId: string;
const A = `itest-item-A-${Date.now()}`;
const B = `itest-item-B-${Date.now()}`;

beforeAll(async () => {
  userId = await seedUser();
  await client`
    insert into public.plaid_items (user_id, item_id, access_token_enc, status, needs_sync, last_synced_at)
    values
      (${userId}, ${A}, 'enc-A', 'active', false, now() - interval '2 days'),
      (${userId}, ${B}, 'enc-B', 'active', true,  now())`;
});
afterAll(async () => {
  await cleanupUser(userId);
  await client.end();
});

describe("plaid item-store (staging Postgres)", () => {
  it("findItemByPlaidItemId resolves the owning row", async () => {
    const row = await findItemByPlaidItemId(db, A);
    expect(row).toMatchObject({ itemId: A, userId, accessTokenEnc: "enc-A", status: "active" });
    expect(await findItemByPlaidItemId(db, "does-not-exist")).toBeNull();
  });

  it("findItemsToSync picks flagged items, and stale ones when a staleBefore is given", async () => {
    const flaggedOnly = (await findItemsToSync(db)).map((i) => i.itemId);
    expect(flaggedOnly).toContain(B);
    expect(flaggedOnly).not.toContain(A);

    const withStale = (await findItemsToSync(db, { staleBefore: new Date(Date.now() - 86_400_000) })).map((i) => i.itemId);
    expect(withStale).toEqual(expect.arrayContaining([A, B]));
  });

  it("markItemNeedsSync sets the flag + last_webhook_at", async () => {
    await markItemNeedsSync(db, A);
    const [row] = await client`select needs_sync, last_webhook_at from public.plaid_items where item_id = ${A}`;
    expect(row.needs_sync).toBe(true);
    expect(row.last_webhook_at).not.toBeNull();
  });

  it("setItemStatus records a login-required state + error code", async () => {
    await setItemStatus(db, A, "login_required", "ITEM_LOGIN_REQUIRED");
    const [row] = await client`select status, error_code from public.plaid_items where item_id = ${A}`;
    expect(row.status).toBe("login_required");
    expect(row.error_code).toBe("ITEM_LOGIN_REQUIRED");
  });

  it("recordSyncFailure increments and flips to 'error' at the threshold", async () => {
    await setItemStatus(db, B, "active");
    for (let i = 0; i < 2; i++) await recordSyncFailure(db, B, "API_ERROR", 3);
    let [row] = await client`select sync_failures, status from public.plaid_items where item_id = ${B}`;
    expect(row.sync_failures).toBe(2);
    expect(row.status).toBe("active");

    await recordSyncFailure(db, B, "API_ERROR", 3);
    [row] = await client`select sync_failures, status from public.plaid_items where item_id = ${B}`;
    expect(row.sync_failures).toBe(3);
    expect(row.status).toBe("error");
  });
});
