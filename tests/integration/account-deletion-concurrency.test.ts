/**
 * Account deletion Path A against a concurrent writer — REAL staging Postgres and the REAL Supabase
 * Auth Admin API (GoTrue deletes `auth.users` as `supabase_auth_admin`; the FK cascades then remove
 * the user's rows inside that one statement).
 *
 * Why this matters: a hard delete cascades through the user's `transactions` in physical scan order
 * (and, through the self-referencing SET NULL FKs, touches partner rows too), while the sync path and
 * the transfer-pairing writers lock rows in their own orders (pairing sorts by id). A writer that is
 * still in flight when the user asks to delete can therefore close a lock cycle with the cascade, and
 * Postgres aborts one side with 40P01.
 *
 * Every scenario builds the interleaving for real: a transaction takes its locks, the real
 * `deleteAccount` is started, and only once Postgres shows the deletion blocked on a lock does the
 * transaction do its next step. No sleeps stand in for ordering.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Products } from "plaid";
import { deleteAccount, type DeleteAccountResult } from "@/lib/account/delete-account";
import { adminSupabase } from "@/lib/supabase/admin";
import { plaidClient } from "@/lib/plaid/client";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { encryptToken } from "@/lib/plaid/crypto";
import { readPlaidError } from "@/lib/plaid/error-policy";
import { client as pg, categoryIdByName, mainAccountId } from "./_db";

const admin = adminSupabase();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const cleanupIds: string[] = [];
const liveTokens: string[] = [];

// Only ever against Plaid's sandbox (fake banks): never runs where PLAID_ENV is anything else.
const sandbox =
  process.env.PLAID_ENV === "sandbox" &&
  !!process.env.PLAID_CLIENT_ID &&
  !!process.env.PLAID_SECRET &&
  !!process.env.PLAID_TOKEN_ENC_KEY;

afterEach(async () => {
  vi.restoreAllMocks();
  // Sandbox hygiene: never leave an Item behind, whatever the test did.
  for (const t of liveTokens.splice(0)) await plaidClient().itemRemove({ access_token: t }).catch(() => {});
  for (const id of cleanupIds.splice(0)) await admin.auth.admin.deleteUser(id, false).catch(() => {});
});

async function createRealUser(): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `itest-del-conc+${crypto.randomUUID()}@example.test`,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  cleanupIds.push(data.user.id);
  return data.user.id;
}

/** A user with two manual transactions, returned in the physical order a cascade scan will visit them. */
async function seedUserWithTwoTransactions() {
  const userId = await createRealUser();
  const accountId = await mainAccountId(userId);
  const categoryId = await categoryIdByName(userId, "Food / Groceries");
  for (const n of [1, 2]) {
    await pg`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
      values (${userId}, ${accountId}, ${categoryId}, ${500 * n}, 'debit', now(), ${`itest txn ${n}`}, 'manual')`;
  }
  const rows = await pg<{ id: string }[]>`select id from public.transactions where user_id = ${userId} order by ctid`;
  return { userId, accountId, categoryId, first: rows[0].id, last: rows[1].id };
}

/** Resolves once a backend is waiting on a lock inside GoTrue's `DELETE FROM auth.users` (the cascade runs inside it). */
async function waitForAuthUserDeleteToBlock(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await pg`
      select 1 from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock' and query ilike '%delete from%users%'`;
    if (rows.length) return;
    await sleep(50);
  }
  throw new Error("the deletion never blocked on a lock; the scenario did not set up");
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
  return {
    authUserExists: !!data?.user,
    transactions: await count("transactions"),
    accounts: await count("accounts"),
    profiles: await count("profiles", "id"),
  };
}

const describeResult = (r: DeleteAccountResult) => (r.ok ? `ok(${r.path})` : `FAILED(${r.error})`);

/** Records what GoTrue answers to each `auth.admin.deleteUser` call (status/code/message only), passing the call through. */
function recordAuthDeleteUserCalls(): string[] {
  const calls: string[] = [];
  const original = admin.auth.admin.deleteUser.bind(admin.auth.admin);
  vi.spyOn(admin.auth.admin, "deleteUser").mockImplementation(async (id, soft) => {
    const r = await original(id, soft);
    calls.push(r.error ? `${r.error.name}/${r.error.status}/${(r.error as { code?: string }).code}/${r.error.message}` : "ok");
    return r;
  });
  return calls;
}
const GONE = { authUserExists: false, transactions: 0, accounts: 0, profiles: 0 };

describe("deleteAccount (Path A) against a concurrent writer — real Postgres + real Auth", () => {
  it("controls: a writer that merely holds a lock delays the deletion, which then completes with nothing left behind", async () => {
    const u = await seedUserWithTwoTransactions();
    let deletion!: Promise<DeleteAccountResult>;

    await pg.begin(async (tx) => {
      await tx`update public.transactions set description = 'itest touch' where id = ${u.last}`;
      deletion = deleteAccount(admin, u.userId);
      await waitForAuthUserDeleteToBlock();
      // (no further lock requested: nothing can deadlock; the transaction just ends)
    });

    expect(describeResult(await deletion)).toBe("ok(hard-delete)");
    expect(await snapshot(u.userId)).toEqual(GONE);
  }, 60_000);

  it("controls: a sync-shaped INSERT (takes a key-share lock on the auth.users row) delays the deletion; the new row is cascaded, not orphaned", async () => {
    const u = await seedUserWithTwoTransactions();
    let deletion!: Promise<DeleteAccountResult>;

    await pg.begin(async (tx) => {
      await tx`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
        values (${u.userId}, ${u.accountId}, ${u.categoryId}, 900, 'debit', now(), 'itest synced insert', 'manual')`;
      deletion = deleteAccount(admin, u.userId);
      await waitForAuthUserDeleteToBlock();
    });

    expect(describeResult(await deletion)).toBe("ok(hard-delete)");
    expect(await snapshot(u.userId)).toEqual(GONE);
  }, 60_000);

  it("a writer that tries to INSERT while the deletion is in flight is refused by the FK and cannot orphan a row", async () => {
    const u = await seedUserWithTwoTransactions();
    let deletion!: Promise<DeleteAccountResult>;
    let insertOutcome = "not attempted";

    await pg.begin(async (tx) => {
      // Hold the row the cascade reaches last, so the deletion is parked mid-cascade, after it has already deleted the user row.
      await tx`update public.transactions set description = 'itest touch' where id = ${u.last}`;
      deletion = deleteAccount(admin, u.userId);
      await waitForAuthUserDeleteToBlock();
      // A second connection now tries to add a row for the user being deleted.
      const late = pg`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
        values (${u.userId}, ${u.accountId}, ${u.categoryId}, 700, 'debit', now(), 'itest late insert', 'manual')`.then(
        () => "inserted",
        (e: { code?: string }) => `refused:${e.code}`,
      );
      await sleep(500); // let it queue behind the deletion's lock on the user row
      void late.then((o) => (insertOutcome = o));
    });

    expect(describeResult(await deletion)).toBe("ok(hard-delete)");
    await sleep(500);
    expect(insertOutcome).toBe("refused:23503"); // foreign_key_violation: the user row is gone
    expect(await snapshot(u.userId)).toEqual(GONE);
  }, 60_000);

  it("survives a lock cycle with a writer that touches the user's rows in the opposite order: the account ends up fully deleted", async () => {
    const u = await seedUserWithTwoTransactions();
    const deadlocksBefore = await deadlockCount();
    let deletion!: Promise<DeleteAccountResult>;
    const authCalls = recordAuthDeleteUserCalls();

    // The writer (a sync applying updates, or a transfer-pairing pass) locks the row the cascade reaches LAST...
    const writerOutcome = await pg
      .begin(async (tx) => {
        await tx`update public.transactions set description = 'itest touch 1' where id = ${u.last}`;

        // ...a real deletion starts and the cascade parks on that row after taking the earlier ones...
        deletion = deleteAccount(admin, u.userId);
        await waitForAuthUserDeleteToBlock();

        // ...then the writer reaches for a row the cascade already holds. That closes the cycle.
        await tx`update public.transactions set description = 'itest touch 2' where id = ${u.first}`;
      })
      .then(
        () => "writer committed" as const,
        (e: { code?: string }) => e,
      );

    const result = await deletion;
    const after = await snapshot(u.userId);
    await sleep(1_500); // pg_stat_database is flushed asynchronously
    const deadlocks = (await deadlockCount()) - deadlocksBefore;

    // What actually happened (visible in the failure message if an assertion below fails).
    const observed = JSON.stringify({
      writer: writerOutcome === "writer committed" ? writerOutcome : `aborted:${writerOutcome.code}`,
      deletion: describeResult(result),
      authDeleteUserCalls: authCalls,
      deadlocksDetected: deadlocks,
      after,
    });

    expect(deadlocks, `the scenario must really deadlock: ${observed}`).toBeGreaterThanOrEqual(1);
    if (result.ok) {
      // User-visible success must mean the deletion completed...
      expect(after, observed).toEqual(GONE);
    } else {
      // ...and a reported failure must mean nothing was half-deleted, so that a retry is safe.
      expect(after, observed).toMatchObject({ authUserExists: true, transactions: 2, profiles: 1 });
      expect(describeResult(await deleteAccount(admin, u.userId)), `retry after a reported failure: ${observed}`).toBe("ok(hard-delete)");
    }
    // The point of the fix: the user's request is not lost to a deadlock that a retry absorbs.
    expect(describeResult(result), observed).toBe("ok(hard-delete)");
  }, 90_000);

  // The Plaid removal is the one irreversible step and it runs BEFORE the auth delete. This records what
  // happens to it when the auth delete then loses a deadlock, and proves it is not repeated needlessly.
  it.skipIf(!sandbox)("with a REAL Plaid sandbox Item: the same lock cycle still ends fully deleted, and the Item is gone at Plaid", async () => {
    const u = await seedUserWithTwoTransactions();
    const pub = await plaidClient().sandboxPublicTokenCreate({ institution_id: "ins_109508", initial_products: [Products.Transactions] });
    const ex = await plaidClient().itemPublicTokenExchange({ public_token: pub.data.public_token });
    liveTokens.push(ex.data.access_token);
    await pg`insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status)
      values (${u.userId}, ${ex.data.item_id}, 'Sandbox Bank', ${encryptToken(ex.data.access_token, loadPlaidConfig().tokenEncKey)}, 'active')`;

    const statusAtPlaid = async () => {
      try {
        await plaidClient().itemGet({ access_token: ex.data.access_token });
        return "alive";
      } catch (e) {
        return readPlaidError(e)?.error_code ?? "unknown";
      }
    };
    expect(await statusAtPlaid()).toBe("alive");

    const deadlocksBefore = await deadlockCount();
    const authCalls = recordAuthDeleteUserCalls();
    let deletion!: Promise<DeleteAccountResult>;

    await pg
      .begin(async (tx) => {
        await tx`update public.transactions set description = 'itest touch 1' where id = ${u.last}`;
        deletion = deleteAccount(admin, u.userId);
        await waitForAuthUserDeleteToBlock(); // Plaid removal and the local Item delete have already happened by now
        await tx`update public.transactions set description = 'itest touch 2' where id = ${u.first}`;
      })
      .catch(() => {});

    const result = await deletion;
    const plaid = await statusAtPlaid();
    const localItems = (await pg`select count(*)::int n from public.plaid_items where user_id = ${u.userId}`)[0].n as number;
    const after = await snapshot(u.userId);
    await sleep(1_500);
    const observed = JSON.stringify({
      deletion: describeResult(result),
      authDeleteUserCalls: authCalls,
      deadlocksDetected: (await deadlockCount()) - deadlocksBefore,
      plaidStatusAfter: plaid,
      localPlaidItemRows: localItems,
      after,
    });

    expect(plaid, observed).toBe("ITEM_NOT_FOUND"); // removed at Plaid, exactly once, whatever happened next
    expect(localItems, observed).toBe(0);
    if (!result.ok) {
      // The state a failed attempt leaves: banks gone, account intact and still signed in - and a retry finishes it.
      expect(after, observed).toMatchObject({ authUserExists: true, transactions: 2, profiles: 1 });
      expect(describeResult(await deleteAccount(admin, u.userId)), `retry after a reported failure: ${observed}`).toBe("ok(hard-delete)");
    }
    expect(describeResult(result), observed).toBe("ok(hard-delete)");
  }, 120_000);
});
