/**
 * Account deletion at realistic scale — REAL staging Postgres and the REAL Auth Admin API.
 *
 * Why this file exists: every earlier deletion test used two-row users, so a cost that grows with
 * (rows deleted x table size) stayed invisible. The self-referencing foreign keys on `transactions`
 * (transfer_pair_id, duplicate_of_id) had no supporting index, so deleting one row made Postgres scan
 * the whole table twice to look for rows pointing at it. Measured on staging for a 25,000-row user:
 * the DELETE itself ~50 ms, the two FK triggers ~20-50 s EACH, and GoTrue's own delete (Path A's last
 * step) answered 504 after ~35 s with nothing committed.
 *
 * Nothing here raises a timeout to make a slow path pass. The statement budget below is the same 8 s
 * PostgREST's `authenticator` role really has; the Auth Admin API is called with its real gateway.
 */
import { afterEach, describe, expect, it } from "vitest";
import { deleteAccount } from "@/lib/account/delete-account";
import { adminSupabase } from "@/lib/supabase/admin";
import { client as pg, categoryIdByName, mainAccountId } from "./_db";

const admin = adminSupabase();
const ROWS = 25_000;
const cleanupIds: string[] = [];

afterEach(async () => {
  for (const id of cleanupIds.splice(0)) {
    // Cleanup must not depend on the very path under test (or a red run would take hours to clean up):
    // remove the bulk rows with FK triggers skipped. Safe here only because every row that references
    // these transactions belongs to the same synthetic user and is being removed with it.
    await pg
      .begin(async (tx) => {
        await tx`set local statement_timeout = 0`;
        await tx`set local session_replication_role = replica`;
        await tx`delete from public.transactions where user_id = ${id}`;
      })
      .catch(() => {});
    await admin.auth.admin.deleteUser(id, false).catch(() => {});
  }
}, 600_000);

/** A real Auth user with `ROWS` transactions plus the other kinds of owned rows a deletion has to remove. */
async function seedHeavyUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: `itest-scale+${crypto.randomUUID()}@example.test`,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  const userId = data.user.id;
  cleanupIds.push(userId);

  const accountId = await mainAccountId(userId);
  const categoryId = await categoryIdByName(userId, "Food / Groceries");
  const seriesIds: string[] = [];
  for (const m of ["m1", "m2", "m3"]) {
    const [s] = await pg<{ id: string }[]>`
      insert into public.recurring_series (user_id, merchant_entity_id, account_id, direction, event_role, cadence, expected_amount, amount_tolerance_minor, last_occurred_at, next_expected_at, observation_count)
      values (${userId}, ${"itest-" + m}, ${accountId}, 'debit', 'PURCHASE', 'MONTHLY', 999, 50, now(), now() + interval '30 days', 3) returning id`;
    seriesIds.push(s.id);
  }
  await pg`insert into public.budgets (user_id, category_id, month, amount) values (${userId}, ${categoryId}, '2026-09-01', 10000)`;
  await pg`insert into public.savings_goals (user_id, name, target_amount) values (${userId}, 'itest goal', 5000)`;
  await pg`
    insert into public.transactions (user_id, account_id, category_id, recurring_stream_id, amount, direction, occurred_at, description, source)
    select ${userId}, ${accountId}, ${categoryId}, case when g % 10 = 0 then ${seriesIds[0]}::uuid end,
           100 + (g % 900), 'debit', now() - (g || ' minutes')::interval, 'itest bulk ' || g, 'manual'
    from generate_series(1, ${ROWS}) g`;
  return { userId };
}

const owned = async (userId: string) =>
  (await pg<{ n: number }[]>`select (select count(*) from public.transactions where user_id = ${userId})::int as n`)[0].n;

describe("account deletion at realistic scale (25,000 transactions)", () => {
  it("every foreign key the deletion path depends on has a usable leading index", async () => {
    // Postgres does not index foreign-key columns. Deleting a parent row runs a lookup on each referencing
    // column; without a leading index that lookup scans the whole child table, once per deleted row.
    const required: Array<[table: string, column: string]> = [
      ["transactions", "transfer_pair_id"], // self-reference, SET NULL: scanned once per deleted transaction
      ["transactions", "duplicate_of_id"], // self-reference, SET NULL: scanned once per deleted transaction
      ["transactions", "recurring_stream_id"], // SET NULL when a recurring_series row is deleted
      ["transactions", "plaid_account_id"], // SET NULL when a plaid_accounts row is deleted (bank disconnect)
      ["transactions", "account_id"], // RESTRICT check when an accounts row is deleted; the existing index on it is partial
    ];
    // A partial index only serves the lookup when its predicate is implied by "column = $1", i.e. exactly
    // "column IS NOT NULL". (transactions_account_fingerprint_idx leads with account_id but is partial on
    // content_fingerprint, so it does NOT count.)
    const missing: string[] = [];
    for (const [table, column] of required) {
      const [row] = await pg<{ n: number }[]>`
        select count(*)::int as n
        from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
        where i.indrelid = ${"public." + table}::regclass and a.attname = ${column} and i.indisvalid
          and (i.indpred is null or pg_get_expr(i.indpred, i.indrelid) = '(' || a.attname || ' IS NOT NULL)')`;
      if (row.n === 0) missing.push(`${table}.${column}`);
    }
    expect(missing, "foreign-key columns with no index leading on them").toEqual([]);
  });

  it("deleting the user's transactions fits the 8 s statement budget PostgREST really has", async () => {
    const { userId } = await seedHeavyUser();
    const started = Date.now();
    let failure = "none";
    await pg
      .begin(async (tx) => {
        await tx`set local statement_timeout = '8s'`; // the `authenticator` role's real limit on staging
        await tx`delete from public.transactions where user_id = ${userId}`;
      })
      .catch((e: { code?: string; message?: string }) => {
        failure = `${e.code}: ${e.message}`;
      });
    const elapsedMs = Date.now() - started;
    console.info(`[scale] DELETE of ${ROWS} transactions under an 8s statement_timeout: ${failure} in ${elapsedMs}ms`);
    expect(failure, `elapsed ${elapsedMs}ms`).toBe("none");
    expect(await owned(userId)).toBe(0);
  }, 300_000);

  it("Path A: a 25,000-transaction user is fully deleted through the real Auth Admin API", async () => {
    const { userId } = await seedHeavyUser();
    const started = Date.now();
    const result = await deleteAccount(admin, userId);
    const elapsedMs = Date.now() - started;
    const { data } = await admin.auth.admin.getUserById(userId);
    const left = await owned(userId);
    console.info(`[scale] Path A deleteAccount, ${ROWS} transactions: ${JSON.stringify(result)} in ${elapsedMs}ms; user still exists=${!!data?.user}; transactions left=${left}`);
    expect(result, `elapsed ${elapsedMs}ms`).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
    expect(data?.user ?? null).toBeNull();
    expect(left).toBe(0);
  }, 300_000);
});
