/**
 * Account deletion Path B (the user has monetization-ledger history) against concurrent writers —
 * REAL staging Postgres, the REAL direct-connection transaction and the REAL Auth Admin API.
 *
 * Path B is structurally different from Path A. Path A is ONE atomic statement (GoTrue's DELETE on
 * auth.users, with the FK cascades inside it). Path B removes the user's data itself and then
 * de-identifies auth.users, which is never removed. These tests were written first, as a REPRODUCTION
 * against the original implementation (nine separate PostgREST deletes) and failed for these measured reasons:
 *   1. a lock cycle aborted one of the separate deletes (40P01) and the request failed;
 *   2. a failure part-way left a signed-in, part-deleted account (goals, budgets and categories already
 *      gone, transactions and the account still there);
 *   3. because the auth.users row SURVIVES, no FK ever refuses a write for that user, so a row written
 *      after its table's turn was silently kept forever while the deletion reported SUCCESS;
 *   4. a 25,000-transaction user hit PostgREST's 8 s statement timeout.
 * They now assert the guarantees the atomic transaction gives: no false success, no partial committed
 * deletion, no surviving owned row, and a retry that finishes the job.
 *
 * Every scenario builds the interleaving for real: a transaction takes its locks, the real
 * `deleteAccount` starts, and only once Postgres shows the deletion blocked on a lock does the
 * writer do its next step. No sleeps stand in for ordering.
 */
import { afterEach, describe, expect, it } from "vitest";
import { deleteAccount, type DeleteAccountResult } from "@/lib/account/delete-account";
import { createDeletionStore, type DeletionStore } from "@/lib/account/deletion-store";
import { adminSupabase } from "@/lib/supabase/admin";
import { client as pg, categoryIdByName, mainAccountId } from "./_db";

const admin = adminSupabase();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const cleanupIds: string[] = [];

// The user-owned tables Path B deletes explicitly (mirrors deleteCascadeOwnedData) plus profiles.
const OWNED_TABLES = [
  "transactions",
  "recurring_series",
  "savings_contributions",
  "savings_goals",
  "budgets",
  "plaid_merchant_rules",
  "categories",
  "accounts",
] as const;

afterEach(async () => {
  for (const id of cleanupIds.splice(0)) {
    // The ledger's user FK is RESTRICT: remove the ledger row first, then whatever is left of the auth user.
    await pg`delete from public.subscriptions where user_id = ${id}`.catch(() => {});
    await admin.auth.admin.deleteUser(id, false).catch(() => {});
  }
});

/** A real Auth user (created through GoTrue, like production) who has ledger history, so Path B applies. */
async function seedPathBUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: `itest-delb+${crypto.randomUUID()}@example.test`,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  const userId = data.user.id;
  cleanupIds.push(userId);

  await pg`insert into public.subscriptions (user_id, platform, platform_subscription_id, plan, status)
    values (${userId}, 'apple', ${"itest-sub-" + crypto.randomUUID()}, 'monthly', 'trialing')`;

  const accountId = await mainAccountId(userId);
  const categoryId = await categoryIdByName(userId, "Food / Groceries");
  for (const n of [1, 2]) {
    await pg`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
      values (${userId}, ${accountId}, ${categoryId}, ${500 * n}, 'debit', now(), ${`itest txn ${n}`}, 'manual')`;
  }
  await pg`insert into public.savings_goals (user_id, name, target_amount) values (${userId}, 'itest goal', 5000)`;
  await pg`insert into public.budgets (user_id, category_id, month, amount) values (${userId}, ${categoryId}, '2026-09-01', 10000)`;
  // The physical order a scan visits the two transactions in.
  const rows = await pg<{ id: string }[]>`select id from public.transactions where user_id = ${userId} order by ctid`;
  return { userId, accountId, categoryId, first: rows[0].id, last: rows[1].id };
}

/** Resolves once a backend is waiting on a lock inside a `DELETE FROM <table>` (PostgREST wraps it in a WITH). */
async function waitForDeleteToBlockOn(table: string, timeoutMs = 15_000) {
  const pattern = `%delete from%${table}%`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await pg`
      select 1 from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock' and query ilike ${pattern}`;
    if (rows.length) return;
    await sleep(50);
  }
  throw new Error(`the deletion never blocked on a lock in DELETE FROM ${table}; the scenario did not set up`);
}

async function deadlockCount(): Promise<number> {
  const [row] = await pg<{ d: number }[]>`select deadlocks::int as d from pg_stat_database where datname = current_database()`;
  return row.d;
}

/** Everything a caller could observe about the account afterwards. */
async function snapshot(userId: string) {
  const { data } = await admin.auth.admin.getUserById(userId);
  const count = async (table: string, col = "user_id") =>
    (await pg.unsafe(`select count(*)::int n from public.${table} where ${col} = $1`, [userId]))[0].n as number;
  const owned: Record<string, number> = {};
  for (const t of OWNED_TABLES) owned[t] = await count(t);
  owned.profiles = await count("profiles", "id");
  return {
    auth: { exists: !!data?.user, deleted: !!data?.user?.deleted_at, banned: !!data?.user?.banned_until },
    owned,
    ledgerSubscriptions: await count("subscriptions"),
  };
}
type Snapshot = Awaited<ReturnType<typeof snapshot>>;
const ownedRowCount = (s: Snapshot) => Object.values(s.owned).reduce((a, b) => a + b, 0);
const leftovers = (s: Snapshot) => Object.fromEntries(Object.entries(s.owned).filter(([, n]) => n > 0));

const describeResult = (r: DeleteAccountResult) => (r.ok ? `ok(${r.path})` : `FAILED(${r.error})`);

/** What "a completed Path B deletion" means: de-identified and banned, nothing owned left, ledger untouched. */
function expectFullyAnonymized(s: Snapshot, message: string) {
  expect(s.auth, message).toEqual({ exists: true, deleted: true, banned: true });
  expect(leftovers(s), message).toEqual({});
  expect(s.ledgerSubscriptions, message).toBe(1);
}

describe("deleteAccount (Path B) against concurrent writers — real Postgres + real PostgREST + real Auth", () => {
  it("control: a writer that merely holds a lock delays the deletion, which then completes with nothing owned left", async () => {
    const u = await seedPathBUser();
    let deletion!: Promise<DeleteAccountResult>;

    await pg.begin(async (tx) => {
      await tx`update public.transactions set description = 'itest touch' where id = ${u.last}`;
      deletion = deleteAccount(admin, u.userId);
      await waitForDeleteToBlockOn("transactions");
      // (no further lock requested: nothing can deadlock; the transaction just ends)
    });

    const result = await deletion;
    expect(describeResult(result)).toBe("ok(anonymize)");
    expectFullyAnonymized(await snapshot(u.userId), "control");
  }, 60_000);

  it("survives a lock cycle on the user's transactions: the account ends up anonymized, not half-deleted", async () => {
    // Which transactions row the deletion scan reaches LAST is decided by Postgres and differs between databases, so try
    // both holds: every attempt must satisfy the guarantees, and a real deadlock must occur in at least one.
    const attempts: string[] = [];
    let sawDeadlock = false;
    for (const hold of ["last", "first"] as const) {
      const u = await seedPathBUser();
      const held = hold === "last" ? u.last : u.first;
      const wanted = hold === "last" ? u.first : u.last;
      const deadlocksBefore = await deadlockCount();
      let deletion!: Promise<DeleteAccountResult>;

      // The writer (a sync applying updates, a transfer-pairing pass) locks one row...
      const writerOutcome = await pg
        .begin(async (tx) => {
          await tx`update public.transactions set description = 'itest touch 1' where id = ${held}`;
          // ...a real deletion starts and parks on it after taking the earlier one...
          deletion = deleteAccount(admin, u.userId);
          await waitForDeleteToBlockOn("transactions");
          // ...then the writer reaches for the other row. If the deletion already holds it, that closes the cycle.
          await tx`update public.transactions set description = 'itest touch 2' where id = ${wanted}`;
        })
        .then(
          () => "writer committed" as const,
          (e: { code?: string }) => e,
        );

      const result = await deletion;
      const after = await snapshot(u.userId);
      await sleep(1_500); // pg_stat_database is flushed asynchronously
      const deadlocks = (await deadlockCount()) - deadlocksBefore;
      const observed = JSON.stringify({
        hold,
        writer: writerOutcome === "writer committed" ? writerOutcome : `aborted:${writerOutcome.code}`,
        deletion: describeResult(result),
        deadlocksDetected: deadlocks,
        after,
      });
      attempts.push(observed);
      if (deadlocks >= 1) sawDeadlock = true;

      if (result.ok) {
        expectFullyAnonymized(after, `success must mean completed: ${observed}`);
      } else {
        // a reported failure must be retryable to completion
        expect(describeResult(await deleteAccount(admin, u.userId)), `retry after a reported failure: ${observed}`).toBe("ok(anonymize)");
      }
      // The point: the user's request is not lost to a deadlock that a bounded retry absorbs.
      expect(describeResult(result), observed).toBe("ok(anonymize)");
      if (sawDeadlock) break;
    }
    expect(sawDeadlock, `the scenario must really deadlock in at least one hold order: ${attempts.join(" || ")}`).toBe(true);
  }, 150_000);

  it("a row written after its table's turn is not silently kept: success means nothing owned is left", async () => {
    const u = await seedPathBUser();
    let deletion!: Promise<DeleteAccountResult>;

    await pg.begin(async (tx) => {
      // Park the deletion at the `accounts` step, i.e. AFTER savings_goals/budgets/... were already emptied.
      await tx`select id from public.accounts where user_id = ${u.userId} for update`;
      deletion = deleteAccount(admin, u.userId);
      await waitForDeleteToBlockOn("accounts");
      // A write for this user lands now (another device, an in-flight request). The auth.users row still
      // exists, so no foreign key refuses it.
      await tx`insert into public.savings_goals (user_id, name, target_amount) values (${u.userId}, 'itest late goal', 100)`;
    });

    const result = await deletion;
    const after = await snapshot(u.userId);
    const observed = JSON.stringify({ deletion: describeResult(result), after, leftovers: leftovers(after) });

    if (result.ok) {
      // User-visible success must mean the intended deletion actually completed.
      expect(ownedRowCount(after), `success reported but owned rows remain: ${observed}`).toBe(0);
      expectFullyAnonymized(after, observed);
    } else {
      expect(describeResult(await deleteAccount(admin, u.userId)), `retry after a reported failure: ${observed}`).toBe("ok(anonymize)");
    }
  }, 60_000);

  it("a transaction created mid-deletion leaves a state a retry can finish, and never a false success", async () => {
    const u = await seedPathBUser();
    let deletion!: Promise<DeleteAccountResult>;

    await pg.begin(async (tx) => {
      // Park the deletion at `savings_goals`, AFTER the transactions delete already ran.
      await tx`select id from public.savings_goals where user_id = ${u.userId} for update`;
      deletion = deleteAccount(admin, u.userId);
      await waitForDeleteToBlockOn("savings_goals");
      // A sync/manual add for the same user lands now, referencing the account that has not been deleted yet.
      await tx`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
        values (${u.userId}, ${u.accountId}, ${u.categoryId}, 700, 'debit', now(), 'itest mid-delete txn', 'manual')`;
    });

    const result = await deletion;
    const after = await snapshot(u.userId);
    const observed = JSON.stringify({ deletion: describeResult(result), after, leftovers: leftovers(after) });
    console.info(`[pathB mid-delete txn] first attempt: ${observed}`);

    if (result.ok) {
      expect(ownedRowCount(after), `success reported but owned rows remain: ${observed}`).toBe(0);
      expectFullyAnonymized(after, observed);
    } else {
      // NO PARTIAL COMMITTED DELETION: the data delete is one transaction, so a failure leaves every table exactly as
      // it was (before the fix, the goal, budget and all categories were already gone while the user stayed signed in).
      expect(after.owned.savings_goals, `a failed attempt must not have deleted anything: ${observed}`).toBe(1);
      expect(after.owned.budgets, observed).toBe(1);
      expect(after.owned.categories, observed).toBeGreaterThan(0);
      expect(after.owned.transactions, observed).toBe(3); // the two seeded rows plus the one written mid-deletion
      expect(after.auth, observed).toEqual({ exists: true, deleted: false, banned: false }); // not de-identified either
      // ...and the retry completes it, taking the row that appeared mid-deletion with it.
      expect(describeResult(await deleteAccount(admin, u.userId)), `retry after a reported failure: ${observed}`).toBe("ok(anonymize)");
      expectFullyAnonymized(await snapshot(u.userId), `after retry: ${observed}`);
    }
  }, 60_000);

  // Measurement, not a pass/fail claim about correctness: how long the deletes take for a heavy user,
  // against PostgREST's per-statement timeout (measured earlier: authenticator statement_timeout = 8s).
  it("measures: a user with 25,000 transactions completes (records elapsed time against the 8s statement timeout)", async () => {
    const u = await seedPathBUser();
    await pg.unsafe(
      `insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
       select $1, $2, $3, 100 + (g % 900), 'debit', now() - (g || ' minutes')::interval, 'itest bulk ' || g, 'manual'
       from generate_series(1, 25000) g`,
      [u.userId, u.accountId, u.categoryId],
    );
    // Time each database step (the rest of the elapsed time is the Auth Admin API and Plaid calls).
    const base = createDeletionStore();
    const stepMs: Record<string, number> = {};
    const timed = <A extends unknown[], R>(name: string, fn: (...a: A) => Promise<R>) =>
      async (...a: A) => {
        const t = Date.now();
        try {
          return await fn(...a);
        } finally {
          stepMs[name] = (stepMs[name] ?? 0) + (Date.now() - t);
        }
      };
    const store: DeletionStore = {
      hasMonetizationHistory: timed("hasMonetizationHistory", base.hasMonetizationHistory),
      markDeleting: timed("markDeleting", base.markDeleting),
      markDeleted: timed("markDeleted", base.markDeleted),
      deleteOwnedData: timed("deleteOwnedData", base.deleteOwnedData),
      countOwnedRows: timed("countOwnedRows", base.countOwnedRows),
    };
    const started = Date.now();
    const result = await deleteAccount(admin, u.userId, store);
    const elapsedMs = Date.now() - started;
    const after = await snapshot(u.userId);
    console.info(`[pathB 25k txns] ${describeResult(result)} in ${elapsedMs}ms; db steps ms=${JSON.stringify(stepMs)}; leftovers=${JSON.stringify(leftovers(after))}`);
    expect(describeResult(result), `elapsed ${elapsedMs}ms`).toBe("ok(anonymize)");
    expectFullyAnonymized(after, `elapsed ${elapsedMs}ms`);
  }, 180_000);
});
