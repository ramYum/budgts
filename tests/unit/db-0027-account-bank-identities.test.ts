// @vitest-environment node
/**
 * Migration 0027 (owner decision 2026-10-02) on real (embedded) Postgres: `account_bank_identities` keeps which bank
 * account (institution, last 4, type, subtype) fed which Budgts account, so a reconnect can suggest the account the kept
 * history lives in after the disconnect deleted `plaid_accounts`.
 *
 * Proves the backfill (a database holding 0000–0026 with live links receives 0027), the recording trigger on every
 * linking path, that nothing is recorded across users, that the identity survives the disconnect and goes with its
 * account, and that clients can only read their own rows.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createAuthUser, migrate, newSupabaseStub, readJournal } from "./helpers/pglite-db";

const journal = readJournal();
const UP_TO_0026 = journal.findIndex((e) => e.tag.startsWith("0027_"));

let pg: PGlite;
let me: string;
let other: string;

const one = async <T>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows[0] as T;
const account = async (userId: string, name: string) =>
  (await one<{ id: string }>(`insert into accounts (user_id, name, type) values ($1, $2, 'checking') returning id`, [userId, name])).id;
const item = async (userId: string, institutionId: string | null) =>
  (
    await one<{ id: string }>(
      `insert into plaid_items (user_id, item_id, institution_id, institution_name, access_token_enc, status)
       values ($1, $2, $3, 'Bank', 'enc', 'active') returning id`,
      [userId, `item-${crypto.randomUUID()}`, institutionId],
    )
  ).id;
const link = async (
  userId: string,
  itemId: string,
  accountId: string | null,
  over: { mask?: string | null; type?: string | null; subtype?: string | null; state?: "mapped" | "ignored" | "unmapped" } = {},
) =>
  (
    await one<{ id: string }>(
      `insert into plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, mask, type, subtype)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [
        userId,
        itemId,
        `pa-${crypto.randomUUID()}`,
        accountId,
        over.state ?? (accountId ? "mapped" : "unmapped"),
        over.mask === undefined ? "1234" : over.mask,
        over.type === undefined ? "depository" : over.type,
        over.subtype === undefined ? "checking" : over.subtype,
      ],
    )
  ).id;
const identities = async (userId: string) =>
  (
    await pg.query<{ account_id: string; institution_id: string; mask: string; type: string; subtype: string }>(
      `select account_id, institution_id, mask, type, subtype from account_bank_identities where user_id = $1
       order by institution_id, mask, type, subtype, account_id`,
      [userId],
    )
  ).rows;

const accts: Record<string, string> = {};

beforeAll(async () => {
  pg = await newSupabaseStub();
  expect(UP_TO_0026).toBeGreaterThan(0);
  await migrate(pg, { upTo: UP_TO_0026 });
  me = await createAuthUser(pg);
  other = await createAuthUser(pg);

  // Today's links, before 0027: what the backfill must and must not record.
  accts.checking = await account(me, "Chase checking");
  accts.card = await account(me, "Chase card");
  accts.paused = await account(me, "Paused savings");
  accts.noMask = await account(me, "No mask");
  accts.noInst = await account(me, "No institution");
  accts.theirs = await account(other, "Their account");
  const chase = await item(me, "ins_chase");
  await link(me, chase, accts.checking, { type: " Depository", subtype: "Checking " });
  await link(me, chase, accts.card, { mask: "9999", type: "credit", subtype: "credit card" });
  await link(me, chase, accts.paused, { mask: "5555", subtype: "savings", state: "ignored" });
  await link(me, chase, accts.noMask, { mask: null });
  await link(me, chase, null, { mask: "7777" }); // unmapped: no Budgts account
  await link(me, await item(me, null), accts.noInst, { mask: "4444" });
  // A link row of mine pointing at ANOTHER user's account must never record anything.
  await link(me, chase, accts.theirs, { mask: "8888" });
  await link(other, await item(other, "ins_chase"), accts.theirs, { mask: "1234", subtype: null });

  expect(await migrate(pg)).toEqual({ applied: journal.length - UP_TO_0026, skipped: UP_TO_0026 });
}, 120_000);

afterAll(async () => {
  await pg.close();
});

describe("0027 account_bank_identities", () => {
  it("backfills every current link with an institution and a last 4, normalized, and only onto the link owner's account", async () => {
    expect(await identities(me)).toEqual([
      { account_id: accts.checking, institution_id: "ins_chase", mask: "1234", type: "depository", subtype: "checking" },
      { account_id: accts.paused, institution_id: "ins_chase", mask: "5555", type: "depository", subtype: "savings" },
      { account_id: accts.card, institution_id: "ins_chase", mask: "9999", type: "credit", subtype: "credit card" },
    ]);
    expect(await identities(other)).toEqual([
      { account_id: accts.theirs, institution_id: "ins_chase", mask: "1234", type: "depository", subtype: "" },
    ]);
  });

  it("records a new link through the trigger, on insert and on mapping an unmapped row, once", async () => {
    const acct = await account(me, "BoA");
    const boa = await item(me, "ins_boa");
    const row = await link(me, boa, null, { mask: "2222" });
    expect((await identities(me)).filter((r) => r.institution_id === "ins_boa")).toEqual([]);
    await pg.query(`update plaid_accounts set account_id = $1, link_state = 'mapped' where id = $2`, [acct, row]);
    await pg.query(`update plaid_accounts set link_state = 'ignored' where id = $1`, [row]); // pause: no new row
    await pg.query(`update plaid_accounts set link_state = 'mapped', account_id = $1 where id = $2`, [acct, row]); // again
    await link(me, boa, acct, { mask: "3333" }); // a second bank account merged into the same Budgts account
    expect((await identities(me)).filter((r) => r.institution_id === "ins_boa")).toEqual([
      { account_id: acct, institution_id: "ins_boa", mask: "2222", type: "depository", subtype: "checking" },
      { account_id: acct, institution_id: "ins_boa", mask: "3333", type: "depository", subtype: "checking" },
    ]);
  });

  it("never records a link onto another user's account", async () => {
    const before = (await identities(other)).length;
    await link(me, await item(me, "ins_x"), accts.theirs, { mask: "6666" });
    expect(await identities(other)).toHaveLength(before);
    expect((await identities(me)).filter((r) => r.institution_id === "ins_x")).toEqual([]);
  });

  it("survives the disconnect (plaid_items deleted) and goes with its account", async () => {
    const acct = await account(me, "Gone bank");
    const gone = await item(me, "ins_gone");
    await link(me, gone, acct, { mask: "1010" });
    await pg.query(`delete from plaid_items where id = $1`, [gone]);
    expect((await identities(me)).filter((r) => r.institution_id === "ins_gone")).toHaveLength(1);
    await pg.query(`delete from accounts where id = $1`, [acct]);
    expect((await identities(me)).filter((r) => r.institution_id === "ins_gone")).toEqual([]);
  });

  it("is owner-readable only, with no client write policy, and RLS on", async () => {
    const [rls] = (await pg.query<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where relname = 'account_bank_identities' and relkind = 'r'`)).rows;
    expect(rls.relrowsecurity).toBe(true);
    const pol = (await pg.query<{ cmd: string; roles: string; qual: string }>(
      `select cmd, roles::text roles, qual from pg_policies where schemaname = 'public' and tablename = 'account_bank_identities'`,
    )).rows;
    expect(pol).toHaveLength(1);
    expect(pol[0]).toMatchObject({ cmd: "SELECT", roles: "{authenticated}" });
    expect(pol[0].qual).toMatch(/auth\.uid\(\).*user_id/);
  });

  it("goes with the user (auth.users cascade, Path A)", async () => {
    const gone = await createAuthUser(pg);
    await link(gone, await item(gone, "ins_chase"), await account(gone, "Mine"));
    expect(await identities(gone)).toHaveLength(1);
    await pg.query(`delete from auth.users where id = $1`, [gone]);
    expect(await identities(gone)).toEqual([]);
  });
});
