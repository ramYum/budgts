/**
 * The database side of account deletion — one narrow port (`DeletionStore`) over the server's DIRECT Postgres
 * connection, so `deleteAccount`'s orchestration stays testable with a fake and the real thing is proven against
 * staging (tests/integration/account-deletion-*.test.ts).
 *
 * Why a direct connection and not the admin Supabase client (PostgREST): (1) a user's owned data can only be
 * removed atomically in ONE transaction, which PostgREST cannot express across tables; (2) PostgREST's
 * `authenticator` role has an 8 s statement timeout, this connection does not; (3) it reports the real Postgres
 * error code, which is what lets a retry be scoped to exactly one proven-safe error; (4) no privileged SQL
 * function has to exist for a client to try to call. The connection is the server's own (`DATABASE_URL`), which
 * bypasses RLS like the service role; the caller has already authenticated the user.
 *
 * Design authority: docs/specs/2026-09-19-account-deletion-design.md.
 */
import "server-only";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/lib/db/schema";

type Db = PostgresJsDatabase<typeof schema>;
type Exec = Pick<Db, "execute">;

/** Monetization-ledger tables whose rows must survive an account deletion (`ON DELETE RESTRICT` to auth.users). */
export const LEDGER_TABLES = ["redemptions", "subscriptions", "payments", "revenue_allocations"] as const;

/**
 * Tables Path B deletes explicitly, in an order that respects the one internal RESTRICT
 * (transactions.account_id -> accounts) — everything else is CASCADE or SET NULL. Column = the owner column.
 * (Path A removes these through the auth.users cascade instead.)
 */
export const OWNED_DELETE_ORDER: ReadonlyArray<readonly [table: string, column: string]> = [
  ["transactions", "user_id"],
  ["recurring_series", "user_id"],
  ["savings_contributions", "user_id"],
  ["savings_goals", "user_id"],
  ["budgets", "user_id"],
  ["plaid_merchant_rules", "user_id"],
  ["categories", "user_id"],
  ["accounts", "user_id"],
  ["profiles", "id"],
];

/** Bank-connection rows are removed at Plaid first (irreversible); the database step only VERIFIES they are gone. */
const PLAID_TABLES: ReadonlyArray<readonly [string, string]> = [
  ["plaid_accounts", "user_id"],
  ["plaid_items", "user_id"],
];
const MUST_BE_EMPTY = [...OWNED_DELETE_ORDER, ...PLAID_TABLES];

export interface DeletionStore {
  /** True if the user has any row in a monetization-ledger table that EXISTS. Absent tables count as "no history". */
  hasMonetizationHistory(userId: string): Promise<boolean>;
  /** Locks the account against user-originated writes (an `account_deletions` row). Idempotent. */
  markDeleting(userId: string): Promise<void>;
  /** Records completion (Path B). Idempotent. */
  markDeleted(userId: string): Promise<void>;
  /** ONE transaction: deletes every owned row in a fixed order, verifies none remain, or rolls back completely. */
  deleteOwnedData(userId: string): Promise<{ deleted: Record<string, number> }>;
  /** Owned rows still present (read-only). */
  countOwnedRows(userId: string): Promise<number>;
}

/** Raised inside the transaction when the database step must not proceed; the transaction rolls back. */
export class DeletionPreconditionError extends Error {}

/** Postgres SQLSTATE of an error, whether raw (postgres-js) or wrapped (drizzle's `.cause`); undefined if none. */
export function pgErrorCode(err: unknown): string | undefined {
  let e = err as { code?: unknown; cause?: unknown } | undefined;
  for (let depth = 0; e && depth < 4; depth++) {
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
    e = e.cause as typeof e;
  }
  return undefined;
}

/** Attempts at the atomic delete, including the first. A lock cycle clears as soon as the other writer commits. */
const MAX_DELETE_ATTEMPTS = 4;
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Re-runs `run` ONLY when Postgres aborted it as a deadlock victim (40P01), with bounded attempts and jittered
 * backoff. Safe because `run` is one transaction: a deadlock victim rolled back completely, so a re-run cannot
 * repeat or half-apply anything. It is deliberately not a general retry: 57014 (statement timeout), 55P03 (lock
 * timeout), 23503 (a foreign key refused it), a constraint or network error each mean something a re-run would
 * not fix, or would hide.
 */
export async function retryOnDeadlock<T>(
  run: () => Promise<T>,
  { attempts = MAX_DELETE_ATTEMPTS, sleep = defaultSleep }: { attempts?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (pgErrorCode(err) !== "40P01" || attempt >= attempts) throw err;
      console.warn("[account] owned-data delete lost a lock cycle (deadlock); retrying", { attempt });
      await sleep(50 * 2 ** (attempt - 1) + Math.random() * 50);
    }
  }
}

/** How many owned rows exist, in ONE round trip (one statement, so also one consistent snapshot). */
async function countOwned(exec: Exec, userId: string): Promise<number> {
  const parts = MUST_BE_EMPTY.map(
    ([table, column]) =>
      sql`(select count(*) from ${sql.identifier("public")}.${sql.identifier(table)} where ${sql.identifier(column)} = ${userId})`,
  );
  const [row] = await exec.execute(sql`select (${sql.join(parts, sql` + `)})::int as n`);
  return Number((row as { n: number }).n);
}

async function defaultDb(): Promise<Db> {
  // Lazy: importing "@/lib/db" throws when DATABASE_URL is unset, which must not happen at module load.
  return (await import("@/lib/db")).db;
}

export function createDeletionStore(
  opts: { db?: Db; ledgerTables?: readonly string[]; sleep?: (ms: number) => Promise<void> } = {},
): DeletionStore {
  const getDb = async () => opts.db ?? (await defaultDb());
  const ledgerTables = opts.ledgerTables ?? LEDGER_TABLES;

  return {
    async hasMonetizationHistory(userId) {
      const db = await getDb();
      for (const table of ledgerTables) {
        // `to_regclass` makes "the table does not exist yet" an explicit, correct answer (no history can exist)
        // instead of an error or a client-library quirk. Any OTHER failure still throws: deletion fails closed.
        const [present] = await db.execute(sql`select to_regclass(${"public." + table}) is not null as present`);
        if (!(present as { present: boolean }).present) continue;
        const [hit] = await db.execute(
          sql`select exists (select 1 from ${sql.identifier("public")}.${sql.identifier(table)} where user_id = ${userId}) as h`,
        );
        if ((hit as { h: boolean }).h) return true;
      }
      return false;
    },

    async markDeleting(userId) {
      const db = await getDb();
      await db.execute(
        sql`insert into public.account_deletions (user_id, state) values (${userId}, 'deleting')
            on conflict (user_id) do update set updated_at = now()`,
      );
    },

    async markDeleted(userId) {
      const db = await getDb();
      await db.execute(sql`update public.account_deletions set state = 'deleted', updated_at = now() where user_id = ${userId}`);
    },

    async deleteOwnedData(userId) {
      const db = await getDb();
      return retryOnDeadlock(
        () =>
          db.transaction(async (tx) => {
            // Bounded waits: fail (and roll back) rather than hang behind a stuck writer, or run away.
            await tx.execute(sql`set local lock_timeout = '10s'`);
            await tx.execute(sql`set local statement_timeout = '60s'`);

            // A bank connection that exists NOW is a live orphan at Plaid if we delete around it.
            const [plaid] = await tx.execute(
              sql`select (select count(*) from public.plaid_items where user_id = ${userId})::int as n`,
            );
            if (Number((plaid as { n: number }).n) > 0) {
              throw new DeletionPreconditionError("a bank connection still exists; it must be removed at Plaid first");
            }

            const deleted: Record<string, number> = {};
            for (const [table, column] of OWNED_DELETE_ORDER) {
              const result = await tx.execute(
                sql`delete from ${sql.identifier("public")}.${sql.identifier(table)} where ${sql.identifier(column)} = ${userId}`,
              );
              deleted[table] = (result as unknown as { count: number }).count;
            }

            // "Success" must mean nothing owned survives: verify inside the same transaction, roll back if not.
            const left = await countOwned(tx, userId);
            if (left > 0) throw new DeletionPreconditionError(`${left} owned rows remain after the delete`);
            return { deleted };
          }),
        { sleep: opts.sleep },
      );
    },

    async countOwnedRows(userId) {
      return countOwned(await getDb(), userId);
    },
  };
}

/** True while (or after) the user's deletion is in progress. Used by routes that must not START new work for them. */
export async function isAccountDeleting(userId: string, db?: Db): Promise<boolean> {
  const handle = db ?? (await defaultDb());
  const [row] = await handle.execute(sql`select exists (select 1 from public.account_deletions where user_id = ${userId}) as d`);
  return Boolean((row as { d: boolean }).d);
}
