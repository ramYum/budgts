/**
 * DB-integration: plaid_items helpers against budgts-staging. Synthetic data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  claimItemForSync,
  claimMissReason,
  findItemByPlaidItemId,
  findSyncCandidates,
  markItemNeedsSync,
  recordSyncFailure,
  releaseSyncClaim,
  SYNC_LEASE_SECONDS,
  setItemStatus,
} from "@/lib/plaid/item-store";
import { cleanupUser, client, db, seedUser } from "./_db";

let userId: string;
const A = `itest-item-A-${Date.now()}`;
const B = `itest-item-B-${Date.now()}`;
const C = `itest-item-C-${Date.now()}`; // lease tests
const D = `itest-item-D-${Date.now()}`; // has an unmapped account

beforeAll(async () => {
  userId = await seedUser();
  await client`
    insert into public.plaid_items (user_id, item_id, access_token_enc, status, needs_sync, last_synced_at)
    values
      (${userId}, ${A}, 'enc-A', 'active', false, now() - interval '2 days'),
      (${userId}, ${B}, 'enc-B', 'active', true,  now()),
      (${userId}, ${C}, 'enc-C', 'active', true,  now()),
      (${userId}, ${D}, 'enc-D', 'active', true,  null)`;
  await client`
    insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, link_state)
    select ${userId}, id, ${D + "-acct"}, 'unmapped' from public.plaid_items where item_id = ${D}`;
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

  it("findSyncCandidates picks flagged + stale active items that are not leased or awaiting mapping", async () => {
    const dayAgo = new Date(Date.now() - 86_400_000);
    const flaggedOnly = await findSyncCandidates(db, new Date(0));
    expect(flaggedOnly).toEqual(expect.arrayContaining([B, C]));
    expect(flaggedOnly).not.toContain(A);

    const withStale = await findSyncCandidates(db, dayAgo);
    expect(withStale).toEqual(expect.arrayContaining([A, B, C]));
  });

  it("two concurrent claims on one Item: exactly one wins (row lock + WHERE re-check)", async () => {
    // Hold A's claim open in a transaction, start B's claim (it blocks on the
    // row lock), then commit A: B must re-evaluate against the claimed row
    // and get nothing back.
    let second: Promise<unknown> | null = null;
    const first = await db.transaction(async (tx) => {
      const won = await claimItemForSync(tx as unknown as typeof db, C, { kind: "due" });
      second = claimItemForSync(db, C, { kind: "requested" });
      await new Promise((r) => setTimeout(r, 500)); // B is now waiting on the lock
      return won;
    });
    expect(first).not.toBeNull();
    expect(await second).toBeNull();

    // And a burst of parallel claimers against the live lease all lose.
    const burst = await Promise.all(Array.from({ length: 8 }, () => claimItemForSync(db, C, { kind: "requested" })));
    expect(burst.filter(Boolean)).toHaveLength(0);

    await releaseSyncClaim(db, C, first!.token, false);
  });

  it("a burst of parallel claims on a free Item yields exactly one winner", async () => {
    await client`update public.plaid_items set needs_sync = true where item_id = ${C}`;
    const burst = await Promise.all(Array.from({ length: 8 }, () => claimItemForSync(db, C, { kind: "due" })));
    const winners = burst.filter((x) => x !== null);
    expect(winners).toHaveLength(1);
    await releaseSyncClaim(db, C, winners[0]!.token, false);
  });

  it("a claim marks the work unsettled (needs_sync = true) in the same UPDATE that takes the lease", async () => {
    await client`update public.plaid_items set needs_sync = false, last_synced_at = now() where item_id = ${C}`;
    const claim = await claimItemForSync(db, C, { kind: "requested" });
    expect(claim).not.toBeNull();
    const [held] = await client`select needs_sync, sync_claim_token from public.plaid_items where item_id = ${C}`;
    expect(held).toEqual({ needs_sync: true, sync_claim_token: claim!.token });
    expect(await releaseSyncClaim(db, C, claim!.token, false)).toBe(false); // only release settles it
  });

  it("a run killed after its claim (never released) is swept once the lease expires, not before", async () => {
    // A user's Sync now on an up-to-date, unflagged Item — the case the sweep
    // used to miss: without the claim-time flag it was neither flagged nor stale.
    await client`update public.plaid_items set needs_sync = false, last_synced_at = now() where item_id = ${C}`;
    const killed = await claimItemForSync(db, C, { kind: "requested" });
    expect(killed).not.toBeNull(); // ...and the function dies here: no release

    const sixHoursAgo = new Date(Date.now() - 6 * 3_600_000);
    expect(await findSyncCandidates(db, sixHoursAgo)).not.toContain(C); // lease still live
    expect(await claimItemForSync(db, C, { kind: "due", staleBefore: sixHoursAgo })).toBeNull();
    const miss = await claimMissReason(db, C);
    expect(miss.kind).toBe("busy");
    if (miss.kind === "busy") {
      expect(miss.retryAfterSeconds).toBeGreaterThan(SYNC_LEASE_SECONDS - 30);
      expect(miss.retryAfterSeconds).toBeLessThanOrEqual(SYNC_LEASE_SECONDS);
    }

    await client`update public.plaid_items
      set sync_claimed_at = now() - make_interval(secs => ${SYNC_LEASE_SECONDS + 1}) where item_id = ${C}`;
    expect(await findSyncCandidates(db, sixHoursAgo)).toContain(C);
    const retried = await claimItemForSync(db, C, { kind: "due", staleBefore: sixHoursAgo });
    expect(retried).not.toBeNull();
    expect(await releaseSyncClaim(db, C, retried!.token, false)).toBe(false);
    expect(await releaseSyncClaim(db, C, killed!.token, false)).toBeNull(); // the dead run can't settle it
  });

  it("release is fenced by token, clears needs_sync, and keeps it when a webhook landed mid-run", async () => {
    await client`update public.plaid_items set needs_sync = true where item_id = ${C}`;
    const claim = await claimItemForSync(db, C, { kind: "due" });
    expect(claim).not.toBeNull();
    const [held] = await client`select needs_sync, sync_claim_token from public.plaid_items where item_id = ${C}`;
    expect(held.needs_sync).toBe(true);
    expect(held.sync_claim_token).toBe(claim!.token);

    expect(await releaseSyncClaim(db, C, "00000000-0000-0000-0000-000000000000", false)).toBeNull();
    expect(await releaseSyncClaim(db, C, claim!.token, false)).toBe(false);

    const again = await claimItemForSync(db, C, { kind: "requested" });
    await markItemNeedsSync(db, C); // webhook while the run is in flight
    expect(await releaseSyncClaim(db, C, again!.token, false)).toBe(true);

    const failed = await claimItemForSync(db, C, { kind: "due" });
    expect(await releaseSyncClaim(db, C, failed!.token, true)).toBe(true); // failure keeps it queued
    const [row] = await client`select sync_claim_token, sync_claimed_at from public.plaid_items where item_id = ${C}`;
    expect(row).toEqual({ sync_claim_token: null, sync_claimed_at: null });
  });

  it("an expired lease (crashed holder) is reclaimable; a live one is not", async () => {
    const stuck = await claimItemForSync(db, C, { kind: "requested" });
    expect(stuck).not.toBeNull();
    expect(await claimItemForSync(db, C, { kind: "requested" })).toBeNull();
    await client`update public.plaid_items
      set sync_claimed_at = now() - make_interval(secs => ${SYNC_LEASE_SECONDS + 1}) where item_id = ${C}`;
    const recovered = await claimItemForSync(db, C, { kind: "requested" });
    expect(recovered).not.toBeNull();
    // the crashed holder's late release can't clear the new lease
    expect(await releaseSyncClaim(db, C, stuck!.token, false)).toBeNull();
    await releaseSyncClaim(db, C, recovered!.token, false);
  });

  it("due claims need an active, flagged (or stale) Item; requested claims don't", async () => {
    await client`update public.plaid_items set needs_sync = false, last_synced_at = now() where item_id = ${C}`;
    expect(await claimItemForSync(db, C, { kind: "due" })).toBeNull();
    expect(await claimItemForSync(db, C, { kind: "due", staleBefore: new Date(Date.now() - 60_000) })).toBeNull();
    const asked = await claimItemForSync(db, C, { kind: "requested" });
    expect(asked).not.toBeNull();
    await releaseSyncClaim(db, C, asked!.token, false);
  });

  it("an Item with an unmapped account is never claimable (its rows would be skipped past)", async () => {
    expect(await claimItemForSync(db, D, { kind: "due" })).toBeNull();
    expect(await claimItemForSync(db, D, { kind: "requested" })).toBeNull();
    expect(await claimMissReason(db, D)).toEqual({ kind: "unmapped" });
    expect(await findSyncCandidates(db, new Date())).not.toContain(D);
    expect(await claimMissReason(db, "does-not-exist")).toEqual({ kind: "gone" });
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
