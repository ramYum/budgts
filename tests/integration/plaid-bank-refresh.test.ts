/**
 * DB-integration: the bank-refresh throttle claim (claimItemsDueForRefresh) against budgts-staging. Synthetic data.
 * Plaid's /transactions/refresh is billed per successful call, so the claim is the cost gate: at most once per
 * REFRESH_THROTTLE_MS (24h) per Item, only the caller's own active Items, and never twice for concurrent pulls.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimItemsDueForRefresh, REFRESH_THROTTLE_MS } from "@/lib/plaid/bank-refresh";
import { cleanupUser, client, db, seedUser } from "./_db";

let userId: string;
let otherUserId: string;
const T = Date.now();
const NEVER = `itest-refresh-never-${T}`; // never refreshed: due
const OLD = `itest-refresh-old-${T}`; // refreshed 25h ago: due
const RECENT = `itest-refresh-recent-${T}`; // refreshed 23h ago: not due
const BROKEN = `itest-refresh-broken-${T}`; // login_required: never refreshed
const OTHERS = `itest-refresh-others-${T}`; // another user's due Item

beforeAll(async () => {
  [userId, otherUserId] = await Promise.all([seedUser(), seedUser()]);
  await client`
    insert into public.plaid_items (user_id, item_id, access_token_enc, status, last_refresh_requested_at)
    values
      (${userId}, ${NEVER}, 'enc-never', 'active', null),
      (${userId}, ${OLD}, 'enc-old', 'active', now() - interval '25 hours'),
      (${userId}, ${RECENT}, 'enc-recent', 'active', now() - interval '23 hours'),
      (${userId}, ${BROKEN}, 'enc-broken', 'login_required', null),
      (${otherUserId}, ${OTHERS}, 'enc-others', 'active', null)`;
});
afterAll(async () => {
  await Promise.all([cleanupUser(userId), cleanupUser(otherUserId)]);
  await client.end();
});

const stamp = async (itemId: string) =>
  (await client`select last_refresh_requested_at::text as at from public.plaid_items where item_id = ${itemId}`)[0]!.at as string | null;

describe("claimItemsDueForRefresh (staging Postgres)", () => {
  it("throttles to once per 24 hours per Item", () => {
    expect(REFRESH_THROTTLE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("claims only the caller's active Items not refreshed in the last 24 hours, and stamps them", async () => {
    const recentBefore = await stamp(RECENT);
    const claimed = await claimItemsDueForRefresh(db, userId);
    expect(claimed.map((c) => c.itemId).sort()).toEqual([NEVER, OLD].sort());
    expect(claimed.find((c) => c.itemId === NEVER)?.accessTokenEnc).toBe("enc-never");

    for (const id of [NEVER, OLD]) expect(Date.now() - new Date((await stamp(id))!).getTime()).toBeLessThan(60_000);
    expect(await stamp(RECENT)).toEqual(recentBefore); // not due: untouched
    expect(await stamp(BROKEN)).toBeNull(); // not active: untouched
    expect(await stamp(OTHERS)).toBeNull(); // another user's Item: untouched
  });

  it("claims nothing on a second pull inside the window, even two at once", async () => {
    const [a, b] = await Promise.all([claimItemsDueForRefresh(db, userId), claimItemsDueForRefresh(db, userId)]);
    expect([...a, ...b]).toEqual([]);
  });

  it("an Item becomes due again once its last request is older than 24 hours", async () => {
    await client`update public.plaid_items set last_refresh_requested_at = now() - interval '24 hours 1 minute' where item_id = ${RECENT}`;
    expect((await claimItemsDueForRefresh(db, userId)).map((c) => c.itemId)).toEqual([RECENT]);
  });
});
