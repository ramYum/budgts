/**
 * DB-integration: `mapAccountsFor` (src/server/plaid/commands.ts) against the real budgts-staging PostgREST endpoint.
 * A repeated or concurrent "new" mapping for the same Plaid account (a double tap before the reload, a retry) must
 * leave ONE Budgts account and ONE link, never a second account with the link repointed at it (which would split the
 * account's history). The first sync is stubbed out: no Plaid.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/server/plaid/service", () => ({
  syncRunner: () => ({ claim: async () => null, release: async () => false, sync: async () => ({ ok: true }), now: () => 0 }),
  drainItemInBackground: () => {},
}));

import { mapAccountsFor } from "@/server/plaid/commands";
import { adminSupabase, cleanupUser, client, insertBankTxn, seedUser } from "./_db";

const supabase = adminSupabase();
let userId: string;

beforeAll(async () => {
  userId = await seedUser();
});
afterAll(async () => {
  await cleanupUser(userId);
});

async function seedUnmappedAccount(): Promise<{ itemRowId: string; plaidAccountId: string }> {
  const plaidAccountId = `itest-pa-${crypto.randomUUID()}`;
  const [item] = await client<{ id: string }[]>`
    insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status)
    values (${userId}, ${`itest-item-${crypto.randomUUID()}`}, 'Itest Bank', 'not-a-real-token', 'active') returning id`;
  await client`
    insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name)
    values (${userId}, ${item!.id}, ${plaidAccountId}, null, 'unmapped', 'Checking')`;
  return { itemRowId: item!.id, plaidAccountId };
}

async function state(itemRowId: string, plaidAccountId: string) {
  const links = await client<{ account_id: string | null; link_state: string }[]>`
    select account_id, link_state from public.plaid_accounts where plaid_item_id = ${itemRowId} and plaid_account_id = ${plaidAccountId}`;
  const accounts = await client<{ id: string }[]>`
    select id from public.accounts where user_id = ${userId} and source = 'plaid' and name = ${`Itest ${plaidAccountId}`}`;
  return { links, accounts };
}

describe("mapAccountsFor never splits an account", () => {
  it("a repeated 'new' leaves one account and one link", async () => {
    const { itemRowId, plaidAccountId } = await seedUnmappedAccount();
    const entry = { plaidAccountId, mode: "new" as const, name: `Itest ${plaidAccountId}`, type: "checking" as const };
    expect(await mapAccountsFor(supabase, userId, itemRowId, [entry])).toMatchObject({ ok: true });
    // The repeat is a no-op that still requests the sync (stubbed here, so it answers ok with a "didn't start" warning).
    expect(await mapAccountsFor(supabase, userId, itemRowId, [entry])).toMatchObject({ ok: true });

    const { links, accounts } = await state(itemRowId, plaidAccountId);
    expect(accounts).toHaveLength(1);
    expect(links).toEqual([{ account_id: accounts[0]!.id, link_state: "mapped" }]);
  });

  it("two concurrent 'new' requests leave one account and one link", async () => {
    const { itemRowId, plaidAccountId } = await seedUnmappedAccount();
    const entry = { plaidAccountId, mode: "new" as const, name: `Itest ${plaidAccountId}`, type: "checking" as const };
    const results = await Promise.all([
      mapAccountsFor(supabase, userId, itemRowId, [entry]),
      mapAccountsFor(supabase, userId, itemRowId, [entry]),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);

    const { links, accounts } = await state(itemRowId, plaidAccountId);
    expect(accounts).toHaveLength(1);
    expect(links).toEqual([{ account_id: accounts[0]!.id, link_state: "mapped" }]);
  });

  it("a paused account whose Budgts account is archived maps to exactly one new account, and the archived one keeps its rows", async () => {
    const { itemRowId, plaidAccountId } = await seedUnmappedAccount();
    const [old] = await client<{ id: string }[]>`
      insert into public.accounts (user_id, name, type, source) values (${userId}, ${`Itest old ${plaidAccountId}`}, 'checking', 'plaid') returning id`;
    const txnId = await insertBankTxn(userId, old!.id);
    await client`update public.accounts set is_archived = true where id = ${old!.id}`;
    await client`
      update public.plaid_accounts set account_id = ${old!.id}, link_state = 'ignored'
      where plaid_item_id = ${itemRowId} and plaid_account_id = ${plaidAccountId}`;

    const entry = { plaidAccountId, mode: "new" as const, name: `Itest ${plaidAccountId}`, type: "checking" as const };
    expect(await mapAccountsFor(supabase, userId, itemRowId, [entry])).toMatchObject({ ok: true });

    const { links, accounts } = await state(itemRowId, plaidAccountId);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.id).not.toBe(old!.id);
    expect(links).toEqual([{ account_id: accounts[0]!.id, link_state: "mapped" }]);
    const [archived] = await client<{ is_archived: boolean }[]>`select is_archived from public.accounts where id = ${old!.id}`;
    expect(archived).toEqual({ is_archived: true });
    const rows = await client<{ id: string }[]>`select id from public.transactions where account_id = ${old!.id}`;
    expect(rows.map((r) => r.id)).toEqual([txnId]);
  });
});
