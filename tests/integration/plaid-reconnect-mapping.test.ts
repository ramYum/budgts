/**
 * DB-integration (staging only: real Postgres, real PostgREST + RLS, real Auth): disconnect a bank, connect it again,
 * accept the mapping step's suggestion, and the re-sent history lands once (owner decision 2026-10-02).
 *
 * The mapping runs through the real `mapAccountsFor` with the user's own token (the trigger from migration 0027 records
 * the bank identity), the suggestion through the real `loadMappingSuggestions` with that token, and the syncs through
 * the real PlaidSyncStore + runSync on synthetic pages, as tests/integration/plaid-reconnect-adoption.test.ts does. The
 * disconnect deletes the plaid_items row exactly as the shared disconnect does. No Plaid calls; the post-mapping sync
 * is stubbed out.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/server/plaid/service", () => ({
  syncRunner: () => ({ claim: async () => null, release: async () => false, sync: async () => ({ ok: true }), now: () => 0 }),
  drainItemInBackground: () => {},
}));

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadMappingSuggestions } from "@/lib/plaid/mapping-suggestions";
import { runSync } from "@/lib/plaid/sync-engine";
import { createPlaidSyncStore } from "@/lib/plaid/sync-store";
import type { NormalizeCtx, PlaidTxnInput } from "@/lib/plaid/types";
import { mapAccountsFor } from "@/server/plaid/commands";
import { adminSupabase, client, db } from "./_db";

const store = createPlaidSyncStore(db);
const admin = adminSupabase();
const stamp = Date.now();
const INSTITUTION = `ins_itest_${stamp}`;
const cleanupIds: string[] = [];

type User = { userId: string; asUser: SupabaseClient };

/** A real user plus a PostgREST client presenting their genuine access token (RLS applies). */
async function userWithToken(): Promise<User> {
  const email = `itest-remap+${crypto.randomUUID()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  cleanupIds.push(data.user.id);
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error || !link.data.properties?.hashed_token) throw link.error ?? new Error("no magic-link token");
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const session = await anon.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
  const token = session.data.session?.access_token;
  if (session.error || !token) throw session.error ?? new Error("no session issued");
  const asUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { userId: data.user.id, asUser };
}

/** What Link + the exchange route leave behind: an Item on the institution and one unmapped Plaid account. */
async function connectUnmapped(userId: string, itemId: string, plaidAccountId: string) {
  const [item] = await client<{ id: string }[]>`
    insert into public.plaid_items (user_id, item_id, institution_id, institution_name, access_token_enc, status)
    values (${userId}, ${itemId}, ${INSTITUTION}, 'Synthetic Bank', 'enc-blob', 'active') returning id`;
  await client`
    insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name, mask, type, subtype)
    values (${userId}, ${item.id}, ${plaidAccountId}, null, 'unmapped', 'Checking', '4321', 'depository', 'checking')`;
  return item.id;
}

async function linkOf(plaidItemRowId: string, plaidAccountId: string) {
  const [pa] = await client<{ id: string; account_id: string }[]>`
    select id, account_id from public.plaid_accounts where plaid_item_id = ${plaidItemRowId} and plaid_account_id = ${plaidAccountId}`;
  return pa;
}

const pTxn = (over: Partial<PlaidTxnInput>): PlaidTxnInput => ({
  transaction_id: "x",
  account_id: "x",
  amount: 10,
  iso_currency_code: "USD",
  unofficial_currency_code: null,
  date: "2026-09-08",
  name: "Coffee",
  merchant_name: "Coffee",
  merchant_entity_id: null,
  pending: false,
  pending_transaction_id: null,
  personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE", confidence_level: "HIGH" },
  ...over,
});

async function sync(userId: string, itemId: string, plaidAccountExternalId: string, link: { id: string; account_id: string }, added: PlaidTxnInput[], cursor: string) {
  await client`update public.plaid_accounts set sign_convention = 'standard' where id = ${link.id}`;
  const ctx: NormalizeCtx = {
    accountMap: new Map([
      [plaidAccountExternalId, { plaidAccountRowId: link.id, budgtsAccountId: link.account_id, ignored: false, signConvention: "standard", accountType: "depository" }],
    ]),
    currency: "USD",
    resolveCategory: () => null,
  };
  return runSync({
    userId,
    itemId,
    institutionId: INSTITUTION,
    initialCursor: null,
    transactionsSync: async () => ({ added, modified: [], removed: [], next_cursor: cursor, has_more: false }),
    store,
    normalizeCtx: ctx,
  });
}

/** What the ledger counts: live, confirmed, non-duplicate bank rows. */
const counted = (userId: string) => client<{ amount: number; account_id: string }[]>`
  select amount, account_id from public.transactions
  where user_id = ${userId} and source = 'bank' and removed_at is null and duplicate_of_id is null and status = 'confirmed'`;

let me: User;
let stranger: User;

beforeAll(async () => {
  me = await userWithToken();
  stranger = await userWithToken();
}, 60_000);

afterAll(async () => {
  for (const id of cleanupIds) await admin.auth.admin.deleteUser(id, false).catch(() => {});
  await client.end();
}, 60_000);

describe("reconnect mapping suggestion (staging)", () => {
  it("disconnect, reconnect, accept the suggestion: the history lands once, in the same account", async () => {
    const OLD_ITEM = `itest-remap-old-${stamp}`;
    const NEW_ITEM = `itest-remap-new-${stamp}`;
    const OLD_PA = `itest-remap-old-pa-${stamp}`;
    const NEW_PA = `itest-remap-new-pa-${stamp}`;

    // 1. First connection, mapped to a new Budgts account by the user (their own token): the trigger records the identity.
    const oldItem = await connectUnmapped(me.userId, OLD_ITEM, OLD_PA);
    expect(await loadMappingSuggestions(me.asUser, me.userId, oldItem)).toEqual({}); // nothing to recognise yet
    expect(
      await mapAccountsFor(me.asUser, me.userId, oldItem, [{ plaidAccountId: OLD_PA, mode: "new", name: "Synthetic checking", type: "checking" }]),
    ).toMatchObject({ ok: true });
    const oldLink = await linkOf(oldItem, OLD_PA);
    const { data: ids } = await me.asUser.from("account_bank_identities").select("account_id, institution_id, mask, type, subtype");
    expect(ids).toEqual([{ account_id: oldLink.account_id, institution_id: INSTITUTION, mask: "4321", type: "depository", subtype: "checking" }]);

    await sync(me.userId, OLD_ITEM, OLD_PA, oldLink, [
      pTxn({ transaction_id: `o1-${stamp}`, account_id: OLD_PA }),
      pTxn({ transaction_id: `o2-${stamp}`, account_id: OLD_PA, date: "2026-09-09", amount: 18, name: "Cinema" }),
    ], "old-cursor");
    const before = await counted(me.userId);
    expect(before).toHaveLength(2);

    // 2. Disconnect: the Item row goes, the ledger stays detached, the identity stays.
    await client`delete from public.plaid_items where user_id = ${me.userId} and item_id = ${OLD_ITEM}`;
    const { data: kept } = await me.asUser.from("account_bank_identities").select("account_id");
    expect(kept).toEqual([{ account_id: oldLink.account_id }]);

    // 3. Reconnect the same bank account: the mapping step suggests the account the history is in.
    await new Promise((r) => setTimeout(r, 20)); // the new Plaid account is connected after the kept rows were imported
    const newItem = await connectUnmapped(me.userId, NEW_ITEM, NEW_PA);
    expect(await loadMappingSuggestions(me.asUser, me.userId, newItem)).toEqual({
      [NEW_PA]: { kind: "previous", accountId: oldLink.account_id, accountName: "Synthetic checking" },
    });
    // Another user never sees this connection, or anything about it.
    expect(await loadMappingSuggestions(stranger.asUser, stranger.userId, newItem)).toBeNull();

    // 4. Accept it, then the new Item re-sends both purchases plus one new one.
    expect(
      await mapAccountsFor(me.asUser, me.userId, newItem, [{ plaidAccountId: NEW_PA, mode: "existing", existingAccountId: oldLink.account_id }]),
    ).toMatchObject({ ok: true });
    const newLink = await linkOf(newItem, NEW_PA);
    expect(newLink.account_id).toBe(oldLink.account_id);
    // While linked again, the account is no longer a reconnect target.
    expect(await loadMappingSuggestions(me.asUser, me.userId, newItem)).toEqual({});

    const out = await sync(me.userId, NEW_ITEM, NEW_PA, newLink, [
      pTxn({ transaction_id: `n1-${stamp}`, account_id: NEW_PA }),
      pTxn({ transaction_id: `n2-${stamp}`, account_id: NEW_PA, date: "2026-09-09", amount: 18, name: "Cinema" }),
      pTxn({ transaction_id: `n3-${stamp}`, account_id: NEW_PA, date: "2026-09-11", amount: 15, name: "Lunch" }),
    ], "new-cursor");
    expect(out.applied).toMatchObject({ inserts: 1, updates: 2 });

    const after = await counted(me.userId);
    expect(after).toHaveLength(3);
    expect(after.every((r) => r.account_id === oldLink.account_id)).toBe(true);
    const total = after.reduce((s, r) => s + Number(r.amount), 0);
    expect(total).toBe(1000 + 1800 + 1500);
  }, 60_000);

  it("never suggests another user's account, even for an identical bank account", async () => {
    const theirItem = await connectUnmapped(stranger.userId, `itest-remap-stranger-${stamp}`, `itest-remap-stranger-pa-${stamp}`);
    expect(await loadMappingSuggestions(stranger.asUser, stranger.userId, theirItem)).toEqual({});
  }, 30_000);
});
