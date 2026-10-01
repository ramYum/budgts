/**
 * Plaid-integration + DB: the cursor never moves past rows that didn't land.
 *
 * A `/transactions/sync` cursor stored past a row is the end of that row: Plaid never re-sends it. This file walks a
 * real Sandbox Item (First Platypus, 14 accounts) through the account-mapping orders a user can take, and the two ways
 * a sync used to run with accounts it couldn't place, checking the landed rows and the stored cursor after each step:
 *   (a) map everything, then sync
 *   (b) the exchange's shape (every account `unmapped`), map 3 and ignore the rest, then sync
 *   (c) a sync attempted while unmapped, then map, then sync
 *   (d) the loss itself, as the pre-lease poller caused it (a sync run on an unmapped Item), and its recovery
 *   (e) an Item whose accounts aren't recorded yet (the exchange writes the Item, then its accounts) is never synced
 *   (f) the bank adds an account after mapping: the sync holds and asks, then lands its rows once mapped
 *
 * One Sandbox Item serves every scenario: the cursor is ours (stored on our row), so each scenario's fresh user and
 * fresh `plaid_items` row starts from no cursor.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { encryptToken } from "@/lib/plaid/crypto";
import { claimItemForSync, findItemByPlaidItemId, releaseSyncClaim, resetItemCursor } from "@/lib/plaid/item-store";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { syncItem } from "@/lib/plaid/sync-item";
import { plaidSyncRunnerDeps, runClaimedSync } from "@/lib/plaid/sync-runner";
import { cleanupUser, createSandboxItemWithTxns, db, pg, plaidTestClient, seedUser, type SandboxItem } from "./_plaid";

const client = plaidTestClient();
const tokenEncKey = loadPlaidConfig().tokenEncKey;
const deps = () => plaidSyncRunnerDeps({ db, client, tokenEncKey });

let sandbox: SandboxItem;
/** Plaid account id -> how many transactions a cursor-less sync returns for it. */
let perAccount: Map<string, number>;
/** The three accounts the owner imported in the device pass. */
let importIds: string[];

let userId: string | null = null;
let itemRowId: string;

beforeAll(async () => {
  sandbox = await createSandboxItemWithTxns(client);
  perAccount = new Map();
  let cursor: string | undefined;
  for (;;) {
    const s = (await client.transactionsSync({ access_token: sandbox.accessToken, cursor, count: 500 })).data;
    for (const t of s.added) perAccount.set(t.account_id, (perAccount.get(t.account_id) ?? 0) + 1);
    cursor = s.next_cursor;
    if (!s.has_more) break;
  }
  // The three busiest accounts, so every scenario has rows to lose.
  importIds = [...perAccount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
});

afterEach(async () => {
  if (userId) await cleanupUser(userId);
  userId = null;
});

afterAll(async () => {
  await client.itemRemove({ access_token: sandbox.accessToken }).catch(() => {});
  await pg.end();
});

/** A fresh user with the Item exchanged exactly as /api/plaid/exchange leaves it, minus the accounts. */
async function exchangeItemOnly(): Promise<void> {
  userId = await seedUser();
  const [item] = await pg<{ id: string }[]>`
    insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status, needs_sync)
    values (${userId}, ${sandbox.itemId}, 'First Platypus Bank', ${encryptToken(sandbox.accessToken, tokenEncKey)}, 'active', true)
    returning id`;
  itemRowId = item.id;
}

/** The exchange's account rows: every account recorded, `unmapped`. `skip` leaves accounts out (not yet at the bank). */
async function recordAccounts(skip: string[] = []): Promise<void> {
  for (const a of sandbox.accounts) {
    if (skip.includes(a.account_id)) continue;
    await pg`
      insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name, type)
      values (${userId}, ${itemRowId}, ${a.account_id}, null, 'unmapped', ${a.name}, ${a.type})`;
  }
}

/** The mapping sheet: `importIds` each into a new Budgts account, every other account "Don't import". */
async function mapAccounts(toImport: string[]): Promise<void> {
  const links = await pg<{ plaid_account_id: string }[]>`
    select plaid_account_id from public.plaid_accounts where plaid_item_id = ${itemRowId} and link_state = 'unmapped'`;
  for (const { plaid_account_id } of links) {
    if (toImport.includes(plaid_account_id)) {
      const [acct] = await pg<{ id: string }[]>`
        insert into public.accounts (user_id, name, type) values (${userId}, ${"Imported " + plaid_account_id.slice(0, 6)}, 'checking')
        returning id`;
      await pg`update public.plaid_accounts set account_id = ${acct.id}, link_state = 'mapped'
               where plaid_item_id = ${itemRowId} and plaid_account_id = ${plaid_account_id}`;
    } else {
      await pg`update public.plaid_accounts set link_state = 'ignored'
               where plaid_item_id = ${itemRowId} and plaid_account_id = ${plaid_account_id}`;
    }
  }
}

/** Sync through the one production path (the per-Item lease), as Sync now / mapping do. */
async function requestedSync() {
  return runClaimedSync(deps(), sandbox.itemId, { kind: "requested" });
}

async function landedByAccount(): Promise<Map<string, number>> {
  const rows = await pg<{ plaid_account_id: string; n: number }[]>`
    select pa.plaid_account_id, count(*)::int n
    from public.transactions t join public.plaid_accounts pa on pa.id = t.plaid_account_id
    where t.user_id = ${userId} and t.source = 'bank' and t.removed_at is null
    group by 1`;
  return new Map(rows.map((r) => [r.plaid_account_id, r.n]));
}

async function storedCursor(): Promise<string | null> {
  const [row] = await pg<{ c: string | null }[]>`select transactions_cursor c from public.plaid_items where id = ${itemRowId}`;
  return row.c;
}

const expected = (ids: string[]) => new Map(ids.map((id) => [id, perAccount.get(id)!]));

describe("the sync cursor never moves past rows that didn't land (real Sandbox Item, staging Postgres)", () => {
  it("(a) map everything first, then sync: every mapped account's rows land", async () => {
    await exchangeItemOnly();
    await recordAccounts();
    await mapAccounts(importIds);
    const out = await requestedSync();
    expect(out.claimed && out.result.ok).toBe(true);
    expect(await landedByAccount()).toEqual(expected(importIds));
    expect(await storedCursor()).toBeTruthy();
  });

  it("(b) exchange (all unmapped) -> map 3, ignore 11 -> sync: the 3 accounts' rows land", async () => {
    await exchangeItemOnly();
    await recordAccounts();
    // ConnectToggle-style partial mapping first: one account at a time, the rest still unmapped -> no sync.
    await pg`update public.plaid_accounts set link_state = 'ignored'
             where plaid_item_id = ${itemRowId} and plaid_account_id = ${sandbox.accounts.find((a) => !importIds.includes(a.account_id))!.account_id}`;
    expect((await requestedSync()).claimed).toBe(false);
    expect(await storedCursor()).toBeNull();
    await mapAccounts(importIds);
    const out = await requestedSync();
    expect(out.claimed && out.result.ok).toBe(true);
    expect(await landedByAccount()).toEqual(expected(importIds));
  });

  it("(c) sync while unmapped is refused and stores no cursor; after mapping, the rows land", async () => {
    await exchangeItemOnly();
    await recordAccounts();
    expect((await requestedSync()).claimed).toBe(false);
    expect(await runClaimedSync(deps(), sandbox.itemId, { kind: "due", staleBefore: new Date() })).toEqual({ claimed: false });
    expect(await storedCursor()).toBeNull();
    await mapAccounts(importIds);
    const out = await requestedSync();
    expect(out.claimed && out.result.ok).toBe(true);
    expect(await landedByAccount()).toEqual(expected(importIds));
  });

  it("(d) a sync that bypasses the claim on an unmapped Item holds instead of skipping its rows past the cursor", async () => {
    await exchangeItemOnly();
    await recordAccounts();
    // What the 30s poller did before 72edc06 (and what a stale deployment still does): syncItem with no mapping
    // guard. Before this fix every row was skipped (no Budgts account yet) and the cursor stored past them.
    const item = (await findItemByPlaidItemId(db, sandbox.itemId))!;
    const early = await syncItem({ db, client, item, tokenEncKey });
    expect(early).toMatchObject({ ok: false, error: "NEW_ACCOUNTS_UNMAPPED" });
    expect(await storedCursor()).toBeNull();

    await mapAccounts(importIds);
    const out = await requestedSync();
    expect(out.claimed && out.result.ok).toBe(true);
    expect(await landedByAccount()).toEqual(expected(importIds));
  });

  it("(d2) an Item already hit by the loss: 'Synced.' lands nothing until a cursor reset, which recovers it once", async () => {
    await exchangeItemOnly();
    await recordAccounts();
    // The affected state, as the stale poller left it: a cursor at the end of the history, no rows landed.
    let cursor: string | undefined;
    for (;;) {
      const s = (await client.transactionsSync({ access_token: sandbox.accessToken, cursor, count: 500 })).data;
      cursor = s.next_cursor;
      if (!s.has_more) break;
    }
    await pg`update public.plaid_items set transactions_cursor = ${cursor!}, last_synced_at = now() where id = ${itemRowId}`;

    await mapAccounts(importIds);
    const after = await requestedSync();
    expect(after.claimed && after.result.ok).toBe(true);
    expect((await landedByAccount()).size).toBe(0); // the symptom: "Synced.", nothing landed, and nothing ever will

    // Recovery: clear the cursor; the next sync re-pulls history and lands what's missing.
    expect(await resetItemCursor(db, sandbox.itemId)).toBe(true);
    const recovered = await requestedSync();
    expect(recovered.claimed && recovered.result.ok).toBe(true);
    expect(await landedByAccount()).toEqual(expected(importIds));

    // Idempotent: a second reset re-pulls the same history and inserts nothing new.
    await resetItemCursor(db, sandbox.itemId);
    const again = await requestedSync();
    expect(again.claimed && again.result.ok && again.result.inserts).toBe(0);
    expect(await landedByAccount()).toEqual(expected(importIds));
  });

  it("(e) an Item with no accounts recorded yet is never claimable (the exchange's two-write window)", async () => {
    await exchangeItemOnly();
    expect(await claimItemForSync(db, sandbox.itemId, { kind: "requested" })).toBeNull();
    expect(await claimItemForSync(db, sandbox.itemId, { kind: "due", staleBefore: new Date() })).toBeNull();
    expect(await storedCursor()).toBeNull();
    await recordAccounts();
    await mapAccounts(importIds);
    const claim = await claimItemForSync(db, sandbox.itemId, { kind: "requested" });
    expect(claim).not.toBeNull();
    await releaseSyncClaim(db, sandbox.itemId, claim!.token, true);
  });

  it("(f) the bank adds an account after mapping: the sync holds and asks, then lands its rows once mapped", async () => {
    const added = importIds[0];
    await exchangeItemOnly();
    await recordAccounts([added]); // the account isn't at the bank yet when the user maps
    await mapAccounts(importIds.slice(1));

    // Now the bank's feed has rows for an account this Item has no link for.
    const held = await requestedSync();
    expect(held.claimed).toBe(true);
    expect(held.claimed && held.result).toMatchObject({ ok: false, error: "NEW_ACCOUNTS_UNMAPPED" });
    expect(await storedCursor()).toBeNull(); // nothing skipped past
    expect((await landedByAccount()).size).toBe(0);
    const [link] = await pg<{ link_state: string; name: string | null }[]>`
      select link_state, name from public.plaid_accounts where plaid_item_id = ${itemRowId} and plaid_account_id = ${added}`;
    expect(link).toEqual({ link_state: "unmapped", name: sandbox.accounts.find((a) => a.account_id === added)!.name });
    // Held visibly: the Item waits for the mapping choice (Connected banks lists the account as not set up).
    expect((await requestedSync()).claimed).toBe(false);

    await mapAccounts([added]);
    const out = await requestedSync();
    expect(out.claimed && out.result.ok).toBe(true);
    expect(await landedByAccount()).toEqual(expected(importIds));
  });
});
