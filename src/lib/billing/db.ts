/**
 * A minimal database port for the billing domain: parameterised SQL in, plain rows out, plus transactions.
 *
 * The billing store deliberately talks to Postgres through THIS interface instead of a specific driver, so the very
 * same code runs against the server's direct connection in production and against an embedded Postgres (PGlite) in
 * tests that apply the real migration chain. Production uses the existing postgres-js client behind `@/lib/db`
 * (the server's own connection, which bypasses RLS like the service role; callers have already authenticated).
 */
import type postgres from "postgres";

export type Row = Record<string, unknown>;

export interface Db {
  /** Runs one parameterised statement ($1, $2, ...) and returns its rows. */
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs `fn` in ONE transaction: it commits if `fn` resolves and rolls back completely if it throws. Nested calls join. */
  transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R>;
}

/** Adapts a postgres-js client (or one of its transactions) to the port. */
export function fromPostgres(client: postgres.Sql | postgres.TransactionSql): Db {
  const inTransaction = (t: postgres.TransactionSql): Db => ({
    query: async <T = Row>(text: string, params: unknown[] = []) => (await t.unsafe(text, params as never[])) as unknown as T[],
    transaction: (fn) => fn(inTransaction(t)), // already inside one: join it
  });
  const root = client as postgres.Sql;
  return {
    query: async <T = Row>(text: string, params: unknown[] = []) => (await root.unsafe(text, params as never[])) as unknown as T[],
    transaction: <R>(fn: (tx: Db) => Promise<R>) => root.begin(async (t) => fn(inTransaction(t))) as Promise<R>,
  };
}

let cached: Db | null = null;

/** The server's database connection. Lazy: importing this module must never throw when DATABASE_URL is unset. */
export async function getServerDb(): Promise<Db> {
  if (!cached) {
    const { db } = await import("@/lib/db");
    cached = fromPostgres(db.$client);
  }
  return cached;
}
